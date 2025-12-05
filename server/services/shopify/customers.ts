import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { createShopifyClient, incrementApiCallCount } from './client';
import { Customer, Prisma } from '@prisma/client';

const log = logger.child({ module: 'customer-sync' });

/**
 * GraphQL query for fetching customers with cursor pagination
 */
const CUSTOMERS_QUERY = `
  query GetCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        node {
          id
          email
          firstName
          lastName
          phone
          createdAt
          updatedAt
          ordersCount
          totalSpent {
            amount
            currencyCode
          }
          tags
          addresses(first: 1) {
            city
            country
            countryCodeV2
          }
          defaultAddress {
            city
            country
            countryCodeV2
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

interface ShopifyCustomerNode {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  ordersCount: number;
  totalSpent: {
    amount: string;
    currencyCode: string;
  };
  tags: string[];
  addresses: Array<{
    city: string | null;
    country: string | null;
    countryCodeV2: string | null;
  }>;
  defaultAddress: {
    city: string | null;
    country: string | null;
    countryCodeV2: string | null;
  } | null;
}

interface CustomersQueryResult {
  customers: {
    edges: Array<{
      node: ShopifyCustomerNode;
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
 * @example "gid://shopify/Customer/123456789" -> "123456789"
 */
function extractShopifyId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/**
 * Transform Shopify customer data to our schema format
 */
function transformCustomer(
  tenantId: string,
  node: ShopifyCustomerNode
): Prisma.CustomerCreateInput {
  return {
    tenant: { connect: { id: tenantId } },
    shopifyId: extractShopifyId(node.id),
    email: node.email,
    firstName: node.firstName,
    lastName: node.lastName,
    phone: node.phone,
    ordersCount: node.ordersCount,
    totalSpent: parseFloat(node.totalSpent.amount),
    shopifyCreatedAt: new Date(node.createdAt),
    // RFM fields will be calculated separately
    recencyScore: null,
    frequencyScore: null,
    monetaryScore: null,
    rfmSegment: null,
    lastOrderDate: null,
  };
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
 * Sync customers from Shopify for a tenant
 */
export async function syncCustomers(
  tenantId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { fullSync = false, batchSize = 50, onProgress } = options;
  const result: SyncResult = { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
  
  log.info({ tenantId, fullSync, batchSize }, 'Starting customer sync');
  
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
      // Fetch customers from Shopify GraphQL API
      const queryResult: CustomersQueryResult = await client.graphql.request(
        CUSTOMERS_QUERY,
        { first: batchSize, after: cursor }
      );
      
      await incrementApiCallCount(tenantId);
      
      const edges = queryResult.customers.edges;
      const pageInfoResult = queryResult.customers.pageInfo;
      
      // Process batch of customers
      for (const edge of edges) {
        try {
          const customerData = transformCustomer(tenantId, edge.node);
          const shopifyId = extractShopifyId(edge.node.id);
          
          // Skip if not updated since last sync (incremental)
          if (lastSyncTime && new Date(edge.node.updatedAt) <= lastSyncTime) {
            continue;
          }
          
          // Upsert customer
          const existingCustomer = await prisma.customer.findFirst({
            where: { tenantId, shopifyId },
          });
          
          if (existingCustomer) {
            await prisma.customer.update({
              where: { id: existingCustomer.id },
              data: {
                email: edge.node.email,
                firstName: edge.node.firstName,
                lastName: edge.node.lastName,
                phone: edge.node.phone,
                ordersCount: edge.node.ordersCount,
                totalSpent: parseFloat(edge.node.totalSpent.amount),
              },
            });
            result.updated++;
          } else {
            await prisma.customer.create({ data: customerData });
            result.created++;
          }
          
          result.totalProcessed++;
        } catch (error) {
          log.error({ tenantId, customerId: edge.node.id, error }, 'Failed to sync customer');
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
      }, 'Customer batch processed');
      
    } catch (error) {
      log.error({ tenantId, cursor, error }, 'Failed to fetch customers batch');
      throw error;
    }
  }
  
  // Update tenant's last sync time
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { lastSyncAt: new Date() },
  });
  
  log.info({ tenantId, result }, 'Customer sync completed');
  
  return result;
}

/**
 * Sync a single customer by Shopify ID
 */
export async function syncSingleCustomer(
  tenantId: string,
  shopifyCustomerId: string
): Promise<Customer | null> {
  const SINGLE_CUSTOMER_QUERY = `
    query GetCustomer($id: ID!) {
      customer(id: $id) {
        id
        email
        firstName
        lastName
        phone
        createdAt
        updatedAt
        ordersCount
        totalSpent {
          amount
          currencyCode
        }
        tags
        defaultAddress {
          city
          country
          countryCodeV2
        }
      }
    }
  `;
  
  const client = await createShopifyClient(tenantId);
  
  const gid = shopifyCustomerId.startsWith('gid://') 
    ? shopifyCustomerId 
    : `gid://shopify/Customer/${shopifyCustomerId}`;
  
  const response = await client.graphql.request<{ customer: ShopifyCustomerNode | null }>(
    SINGLE_CUSTOMER_QUERY,
    { id: gid }
  );
  
  await incrementApiCallCount(tenantId);
  
  if (!response.customer) {
    return null;
  }
  
  const node = response.customer;
  const shopifyId = extractShopifyId(node.id);
  
  // Upsert
  const existingCustomer = await prisma.customer.findFirst({
    where: { tenantId, shopifyId },
  });
  
  if (existingCustomer) {
    return prisma.customer.update({
      where: { id: existingCustomer.id },
      data: {
        email: node.email,
        firstName: node.firstName,
        lastName: node.lastName,
        phone: node.phone,
        ordersCount: node.ordersCount,
        totalSpent: parseFloat(node.totalSpent.amount),
      },
    });
  }
  
  return prisma.customer.create({
    data: {
      tenantId,
      shopifyId,
      email: node.email,
      firstName: node.firstName,
      lastName: node.lastName,
      phone: node.phone,
      ordersCount: node.ordersCount,
      totalSpent: parseFloat(node.totalSpent.amount),
      shopifyCreatedAt: new Date(node.createdAt),
    },
  });
}
