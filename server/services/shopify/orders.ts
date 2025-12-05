import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { createShopifyClient, incrementApiCallCount } from './client';
import { Order, FinancialStatus, FulfillmentStatus, Prisma } from '@prisma/client';

const log = logger.child({ module: 'order-sync' });

/**
 * GraphQL query for fetching orders with cursor pagination
 */
const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after) {
      edges {
        node {
          id
          name
          orderNumber
          createdAt
          updatedAt
          processedAt
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                quantity
                variant {
                  id
                  sku
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                product {
                  id
                }
              }
            }
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

interface ShopifyLineItem {
  id: string;
  title: string;
  quantity: number;
  variant: {
    id: string;
    sku: string | null;
  } | null;
  originalUnitPriceSet: {
    shopMoney: {
      amount: string;
    };
  };
  product: {
    id: string;
  } | null;
}

interface ShopifyOrderNode {
  id: string;
  name: string;
  orderNumber: number;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  subtotalPriceSet: {
    shopMoney: {
      amount: string;
    };
  };
  totalTaxSet: {
    shopMoney: {
      amount: string;
    };
  };
  totalDiscountsSet: {
    shopMoney: {
      amount: string;
    };
  };
  customer: {
    id: string;
  } | null;
  lineItems: {
    edges: Array<{
      node: ShopifyLineItem;
    }>;
  };
}

interface OrdersQueryResult {
  orders: {
    edges: Array<{
      node: ShopifyOrderNode;
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
 * Map Shopify financial status to our enum
 */
function mapFinancialStatus(status: string): FinancialStatus {
  const statusMap: Record<string, FinancialStatus> = {
    'PENDING': 'PENDING',
    'AUTHORIZED': 'AUTHORIZED',
    'PARTIALLY_PAID': 'PARTIALLY_PAID',
    'PAID': 'PAID',
    'PARTIALLY_REFUNDED': 'PARTIALLY_REFUNDED',
    'REFUNDED': 'REFUNDED',
    'VOIDED': 'VOIDED',
  };
  return statusMap[status] || 'PENDING';
}

/**
 * Map Shopify fulfillment status to our enum
 */
function mapFulfillmentStatus(status: string | null): FulfillmentStatus | null {
  if (!status) return null;
  
  const statusMap: Record<string, FulfillmentStatus> = {
    'FULFILLED': 'FULFILLED',
    'PARTIAL': 'PARTIAL',
    'RESTOCKED': 'RESTOCKED',
    'PENDING': 'PENDING',
  };
  return statusMap[status] || null;
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
 * Sync orders from Shopify for a tenant
 */
export async function syncOrders(
  tenantId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { fullSync = false, batchSize = 50, onProgress } = options;
  const result: SyncResult = { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
  
  log.info({ tenantId, fullSync, batchSize }, 'Starting order sync');
  
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
      const queryResult: OrdersQueryResult = await client.graphql.request(
        ORDERS_QUERY,
        { first: batchSize, after: cursor }
      );
      
      await incrementApiCallCount(tenantId);
      
      const edges = queryResult.orders.edges;
      const pageInfoResult = queryResult.orders.pageInfo;
      
      // Process batch of orders
      for (const edge of edges) {
        try {
          const node = edge.node;
          const shopifyId = extractShopifyId(node.id);
          
          // Skip if not updated since last sync (incremental)
          if (lastSyncTime && new Date(node.updatedAt) <= lastSyncTime) {
            continue;
          }
          
          // Transform line items
          const lineItems = node.lineItems.edges.map(e => ({
            shopifyLineItemId: extractShopifyId(e.node.id),
            title: e.node.title,
            quantity: e.node.quantity,
            price: parseFloat(e.node.originalUnitPriceSet.shopMoney.amount),
            sku: e.node.variant?.sku || null,
            productId: e.node.product ? extractShopifyId(e.node.product.id) : null,
            variantId: e.node.variant ? extractShopifyId(e.node.variant.id) : null,
          }));
          
          // Find customer if exists
          let customerId: string | null = null;
          if (node.customer) {
            const shopifyCustomerId = extractShopifyId(node.customer.id);
            const customer = await prisma.customer.findFirst({
              where: { tenantId, shopifyId: shopifyCustomerId },
              select: { id: true },
            });
            customerId = customer?.id || null;
          }
          
          const orderDate = node.processedAt 
            ? new Date(node.processedAt) 
            : new Date(node.createdAt);
          
          const orderData = {
            orderNumber: node.orderNumber,
            orderName: node.name,
            totalPrice: parseFloat(node.totalPriceSet.shopMoney.amount),
            subtotalPrice: parseFloat(node.subtotalPriceSet.shopMoney.amount),
            totalTax: parseFloat(node.totalTaxSet.shopMoney.amount),
            totalDiscounts: parseFloat(node.totalDiscountsSet.shopMoney.amount),
            financialStatus: mapFinancialStatus(node.displayFinancialStatus),
            fulfillmentStatus: mapFulfillmentStatus(node.displayFulfillmentStatus),
            cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : null,
            lineItems: lineItems as Prisma.InputJsonValue,
            lineItemsCount: lineItems.length,
            currency: node.totalPriceSet.shopMoney.currencyCode,
            orderDate,
            orderMonth: `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`,
            shopifyUpdatedAt: new Date(node.updatedAt),
          };
          
          // Upsert order
          const existingOrder = await prisma.order.findFirst({
            where: { tenantId, shopifyId },
          });
          
          if (existingOrder) {
            await prisma.order.update({
              where: { id: existingOrder.id },
              data: {
                ...orderData,
                customerId,
              },
            });
            result.updated++;
          } else {
            await prisma.order.create({
              data: {
                tenantId,
                shopifyId,
                customerId,
                ...orderData,
                shopifyCreatedAt: new Date(node.createdAt),
              },
            });
            result.created++;
          }
          
          result.totalProcessed++;
        } catch (error) {
          log.error({ tenantId, orderId: edge.node.id, error }, 'Failed to sync order');
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
      }, 'Order batch processed');
      
    } catch (error) {
      log.error({ tenantId, cursor, error }, 'Failed to fetch orders batch');
      throw error;
    }
  }
  
  log.info({ tenantId, result }, 'Order sync completed');
  
  return result;
}

/**
 * Sync a single order by Shopify ID
 */
export async function syncSingleOrder(
  tenantId: string,
  shopifyOrderId: string
): Promise<Order | null> {
  const SINGLE_ORDER_QUERY = `
    query GetOrder($id: ID!) {
      order(id: $id) {
        id
        name
        orderNumber
        createdAt
        updatedAt
        processedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
          }
        }
        totalTaxSet {
          shopMoney {
            amount
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
          }
        }
        customer {
          id
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              quantity
              variant {
                id
                sku
              }
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
              product {
                id
              }
            }
          }
        }
      }
    }
  `;
  
  const client = await createShopifyClient(tenantId);
  
  const gid = shopifyOrderId.startsWith('gid://') 
    ? shopifyOrderId 
    : `gid://shopify/Order/${shopifyOrderId}`;
  
  const queryResult: { order: ShopifyOrderNode | null } = await client.graphql.request(
    SINGLE_ORDER_QUERY,
    { id: gid }
  );
  
  await incrementApiCallCount(tenantId);
  
  if (!queryResult.order) {
    return null;
  }
  
  const node = queryResult.order;
  const shopifyId = extractShopifyId(node.id);
  
  // Transform line items
  const lineItems = node.lineItems.edges.map(e => ({
    shopifyLineItemId: extractShopifyId(e.node.id),
    title: e.node.title,
    quantity: e.node.quantity,
    price: parseFloat(e.node.originalUnitPriceSet.shopMoney.amount),
    sku: e.node.variant?.sku || null,
    productId: e.node.product ? extractShopifyId(e.node.product.id) : null,
    variantId: e.node.variant ? extractShopifyId(e.node.variant.id) : null,
  }));
  
  // Find customer if exists
  let customerId: string | null = null;
  if (node.customer) {
    const shopifyCustomerId = extractShopifyId(node.customer.id);
    const customer = await prisma.customer.findFirst({
      where: { tenantId, shopifyId: shopifyCustomerId },
      select: { id: true },
    });
    customerId = customer?.id || null;
  }
  
  const orderDate = node.processedAt 
    ? new Date(node.processedAt) 
    : new Date(node.createdAt);
  
  // Upsert
  const existingOrder = await prisma.order.findFirst({
    where: { tenantId, shopifyId },
  });
  
  const orderData = {
    orderNumber: node.orderNumber,
    orderName: node.name,
    totalPrice: parseFloat(node.totalPriceSet.shopMoney.amount),
    subtotalPrice: parseFloat(node.subtotalPriceSet.shopMoney.amount),
    totalTax: parseFloat(node.totalTaxSet.shopMoney.amount),
    totalDiscounts: parseFloat(node.totalDiscountsSet.shopMoney.amount),
    financialStatus: mapFinancialStatus(node.displayFinancialStatus),
    fulfillmentStatus: mapFulfillmentStatus(node.displayFulfillmentStatus),
    cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : null,
    lineItems: lineItems as Prisma.InputJsonValue,
    lineItemsCount: lineItems.length,
    currency: node.totalPriceSet.shopMoney.currencyCode,
    orderDate,
    orderMonth: `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`,
    shopifyUpdatedAt: new Date(node.updatedAt),
  };
  
  if (existingOrder) {
    return prisma.order.update({
      where: { id: existingOrder.id },
      data: {
        ...orderData,
        customerId,
      },
    });
  }
  
  return prisma.order.create({
    data: {
      tenantId,
      shopifyId,
      customerId,
      ...orderData,
      shopifyCreatedAt: new Date(node.createdAt),
    },
  });
}

/**
 * Update customer order statistics after order sync
 */
export async function updateCustomerOrderStats(tenantId: string): Promise<void> {
  log.info({ tenantId }, 'Updating customer order statistics');
  
  // Get all customers with their orders
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: {
      orders: {
        select: {
          totalPrice: true,
          orderDate: true,
        },
        where: {
          financialStatus: { not: 'VOIDED' },
          cancelledAt: null,
        },
        orderBy: {
          orderDate: 'desc',
        },
      },
    },
  });
  
  // Update each customer's stats
  for (const customer of customers) {
    const orderCount = customer.orders.length;
    const totalSpent = customer.orders.reduce(
      (sum, order) => sum + Number(order.totalPrice), 
      0
    );
    const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
    const lastOrderDate = customer.orders[0]?.orderDate || null;
    const firstOrderDate = customer.orders.length > 0 
      ? customer.orders[customer.orders.length - 1].orderDate 
      : null;
    
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        ordersCount: orderCount,
        totalSpent,
        avgOrderValue,
        lastOrderDate,
        firstOrderDate,
      },
    });
  }
  
  log.info({ tenantId, customerCount: customers.length }, 'Customer order statistics updated');
}
