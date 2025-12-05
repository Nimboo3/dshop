import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { createShopifyClient, incrementApiCallCount } from './client';
import { Product, ProductStatus, Prisma } from '@prisma/client';

const log = logger.child({ module: 'product-sync' });

/**
 * GraphQL query for fetching products with cursor pagination
 */
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          description
          productType
          vendor
          status
          createdAt
          updatedAt
          priceRangeV2 {
            minVariantPrice {
              amount
            }
            maxVariantPrice {
              amount
            }
          }
          compareAtPriceRange {
            minVariantPrice {
              amount
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
              }
            }
          }
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          featuredImage {
            url
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
}

interface ShopifyImage {
  url: string;
  altText: string | null;
}

interface ShopifyProductNode {
  id: string;
  title: string;
  description: string | null;
  productType: string;
  vendor: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
    };
    maxVariantPrice: {
      amount: string;
    };
  };
  compareAtPriceRange: {
    minVariantPrice: {
      amount: string;
    };
  };
  variants: {
    edges: Array<{
      node: ShopifyVariant;
    }>;
  };
  images: {
    edges: Array<{
      node: ShopifyImage;
    }>;
  };
  featuredImage: {
    url: string;
  } | null;
}

interface ProductsQueryResult {
  products: {
    edges: Array<{
      node: ShopifyProductNode;
      cursor: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

/**
 * Extract numeric ID from Shopify GID
 */
function extractShopifyId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/**
 * Map Shopify product status to our enum
 */
function mapProductStatus(status: string): ProductStatus {
  const statusMap: Record<string, ProductStatus> = {
    'ACTIVE': 'ACTIVE',
    'ARCHIVED': 'ARCHIVED',
    'DRAFT': 'DRAFT',
  };
  return statusMap[status] || 'ACTIVE';
}

export interface SyncOptions {
  fullSync?: boolean;
  batchSize?: number;
  onProgress?: (processed: number, total: number | null) => void;
}

export interface SyncResult {
  created: number;
  updated: number;
  errors: number;
  totalProcessed: number;
}

/**
 * Sync products from Shopify for a tenant
 */
export async function syncProducts(
  tenantId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { fullSync = false, batchSize = 50, onProgress } = options;
  const result: SyncResult = { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
  
  log.info({ tenantId, fullSync, batchSize }, 'Starting product sync');
  
  const client = await createShopifyClient(tenantId);
  
  // Get last sync time for incremental sync
  let lastSyncTime: Date | null = null;
  if (!fullSync) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lastSyncAt: true },
    });
    lastSyncTime = tenant?.lastSyncAt || null;
  }
  
  let hasNextPage = true;
  let cursor: string | null = null;
  
  while (hasNextPage) {
    try {
      const queryResult: ProductsQueryResult = await client.graphql.request(
        PRODUCTS_QUERY,
        { first: batchSize, after: cursor }
      );
      
      await incrementApiCallCount(tenantId);
      
      const edges = queryResult.products.edges;
      const pageInfoResult = queryResult.products.pageInfo;
      
      // Process batch of products
      for (const edge of edges) {
        try {
          const node = edge.node;
          const shopifyId = extractShopifyId(node.id);
          
          // Skip if not updated since last sync (incremental)
          if (lastSyncTime && new Date(node.updatedAt) <= lastSyncTime) {
            continue;
          }
          
          // Transform variants
          const variants = node.variants.edges.map(e => ({
            shopifyVariantId: extractShopifyId(e.node.id),
            title: e.node.title,
            sku: e.node.sku,
            price: parseFloat(e.node.price),
            compareAtPrice: e.node.compareAtPrice ? parseFloat(e.node.compareAtPrice) : null,
            inventoryQuantity: e.node.inventoryQuantity,
          }));
          
          // Transform images
          const images = node.images.edges.map(e => ({
            src: e.node.url,
            alt: e.node.altText,
          }));
          
          const productData = {
            title: node.title,
            description: node.description,
            vendor: node.vendor || null,
            productType: node.productType || null,
            status: mapProductStatus(node.status),
            price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
            compareAtPrice: node.compareAtPriceRange.minVariantPrice.amount 
              ? parseFloat(node.compareAtPriceRange.minVariantPrice.amount) 
              : null,
            variants: variants as Prisma.InputJsonValue,
            variantCount: variants.length,
            images: images as Prisma.InputJsonValue,
            featuredImage: node.featuredImage?.url || null,
            shopifyUpdatedAt: new Date(node.updatedAt),
          };
          
          // Upsert product
          const existingProduct = await prisma.product.findFirst({
            where: { tenantId, shopifyId },
          });
          
          if (existingProduct) {
            await prisma.product.update({
              where: { id: existingProduct.id },
              data: productData,
            });
            result.updated++;
          } else {
            await prisma.product.create({
              data: {
                tenantId,
                shopifyId,
                ...productData,
                shopifyCreatedAt: new Date(node.createdAt),
              },
            });
            result.created++;
          }
          
          result.totalProcessed++;
        } catch (error) {
          log.error({ tenantId, productId: edge.node.id, error }, 'Failed to sync product');
          result.errors++;
        }
      }
      
      // Update pagination
      hasNextPage = pageInfoResult.hasNextPage;
      cursor = pageInfoResult.endCursor;
      
      // Progress callback
      if (onProgress) {
        onProgress(result.totalProcessed, null);
      }
      
      log.debug({ 
        tenantId, 
        processed: result.totalProcessed, 
        hasNextPage 
      }, 'Product batch processed');
      
    } catch (error) {
      log.error({ tenantId, cursor, error }, 'Failed to fetch products batch');
      throw error;
    }
  }
  
  log.info({ tenantId, result }, 'Product sync completed');
  
  return result;
}

/**
 * Sync a single product by Shopify ID
 */
export async function syncSingleProduct(
  tenantId: string,
  shopifyProductId: string
): Promise<Product | null> {
  const SINGLE_PRODUCT_QUERY = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        id
        title
        description
        productType
        vendor
        status
        createdAt
        updatedAt
        priceRangeV2 {
          minVariantPrice {
            amount
          }
          maxVariantPrice {
            amount
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            amount
          }
        }
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
            }
          }
        }
        images(first: 10) {
          edges {
            node {
              url
              altText
            }
          }
        }
        featuredImage {
          url
        }
      }
    }
  `;
  
  const client = await createShopifyClient(tenantId);
  
  const gid = shopifyProductId.startsWith('gid://') 
    ? shopifyProductId 
    : `gid://shopify/Product/${shopifyProductId}`;
  
  const queryResult: { product: ShopifyProductNode | null } = await client.graphql.request(
    SINGLE_PRODUCT_QUERY,
    { id: gid }
  );
  
  await incrementApiCallCount(tenantId);
  
  if (!queryResult.product) {
    return null;
  }
  
  const node = queryResult.product;
  const shopifyId = extractShopifyId(node.id);
  
  // Transform variants
  const variants = node.variants.edges.map(e => ({
    shopifyVariantId: extractShopifyId(e.node.id),
    title: e.node.title,
    sku: e.node.sku,
    price: parseFloat(e.node.price),
    compareAtPrice: e.node.compareAtPrice ? parseFloat(e.node.compareAtPrice) : null,
    inventoryQuantity: e.node.inventoryQuantity,
  }));
  
  // Transform images
  const images = node.images.edges.map(e => ({
    src: e.node.url,
    alt: e.node.altText,
  }));
  
  const productData = {
    title: node.title,
    description: node.description,
    vendor: node.vendor || null,
    productType: node.productType || null,
    status: mapProductStatus(node.status),
    price: parseFloat(node.priceRangeV2.minVariantPrice.amount),
    compareAtPrice: node.compareAtPriceRange.minVariantPrice.amount 
      ? parseFloat(node.compareAtPriceRange.minVariantPrice.amount) 
      : null,
    variants: variants as Prisma.InputJsonValue,
    variantCount: variants.length,
    images: images as Prisma.InputJsonValue,
    featuredImage: node.featuredImage?.url || null,
    shopifyUpdatedAt: new Date(node.updatedAt),
  };
  
  // Upsert
  const existingProduct = await prisma.product.findFirst({
    where: { tenantId, shopifyId },
  });
  
  if (existingProduct) {
    return prisma.product.update({
      where: { id: existingProduct.id },
      data: productData,
    });
  }
  
  return prisma.product.create({
    data: {
      tenantId,
      shopifyId,
      ...productData,
      shopifyCreatedAt: new Date(node.createdAt),
    },
  });
}
