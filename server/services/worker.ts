import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import {
  QUEUE_NAMES,
  WebhookJobData,
  CustomerSyncJobData,
  OrderSyncJobData,
  RfmCalculationJobData,
  SegmentUpdateJobData,
  BulkOperationJobData,
} from './queue';
import { syncSingleCustomer, syncSingleOrder } from './shopify';

const log = logger.child({ module: 'worker' });

// Worker options
const workerOptions = {
  connection: redis,
  concurrency: 5,
};

/**
 * Process webhook events
 */
async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const { tenantId, topic, shopDomain, payload, receivedAt } = job.data;
  log.info({ jobId: job.id, topic, shopDomain }, 'Processing webhook');

  try {
    // Route to appropriate handler based on topic
    switch (topic) {
      case 'customers/create':
      case 'customers/update':
        await handleCustomerWebhook(tenantId, topic, payload);
        break;
      case 'customers/delete':
        await handleCustomerDelete(tenantId, payload);
        break;
      case 'orders/create':
      case 'orders/updated':
      case 'orders/paid':
        await handleOrderWebhook(tenantId, topic, payload);
        break;
      case 'orders/cancelled':
        await handleOrderCancellation(tenantId, payload);
        break;
      default:
        log.info({ topic }, 'Unhandled webhook topic');
    }

    // Mark webhook event as processed
    await prisma.webhookEvent.updateMany({
      where: {
        tenantId,
        topic,
        processedAt: null,
      },
      data: {
        processedAt: new Date(),
        status: 'PROCESSED',
      },
    });
  } catch (error) {
    log.error({ error, topic }, 'Webhook processing failed');
    
    // Mark as failed
    await prisma.webhookEvent.updateMany({
      where: {
        tenantId,
        topic,
        processedAt: null,
      },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    
    throw error; // Re-throw to trigger retry
  }
}

async function handleCustomerWebhook(
  tenantId: string,
  topic: string,
  payload: Record<string, unknown>
): Promise<void> {
  const shopifyId = String(payload.id);
  
  const existingCustomer = await prisma.customer.findFirst({
    where: { tenantId, shopifyId },
  });
  
  if (existingCustomer) {
    await prisma.customer.update({
      where: { id: existingCustomer.id },
      data: {
        email: (payload.email as string) || null,
        firstName: (payload.first_name as string) || null,
        lastName: (payload.last_name as string) || null,
        phone: (payload.phone as string) || null,
        ordersCount: (payload.orders_count as number) || existingCustomer.ordersCount,
        totalSpent: payload.total_spent ? parseFloat(payload.total_spent as string) : Number(existingCustomer.totalSpent),
      },
    });
  } else {
    await prisma.customer.create({
      data: {
        tenantId,
        shopifyId,
        email: (payload.email as string) || null,
        firstName: (payload.first_name as string) || null,
        lastName: (payload.last_name as string) || null,
        phone: (payload.phone as string) || null,
        ordersCount: (payload.orders_count as number) || 0,
        totalSpent: payload.total_spent ? parseFloat(payload.total_spent as string) : 0,
        shopifyCreatedAt: payload.created_at ? new Date(payload.created_at as string) : new Date(),
      },
    });
  }

  log.info({ tenantId, shopifyId }, 'Customer upserted from webhook');
}

async function handleCustomerDelete(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const shopifyId = String(payload.id);
  
  // Delete customer (cascade will handle related records)
  await prisma.customer.deleteMany({
    where: {
      tenantId,
      shopifyId,
    },
  });

  log.info({ tenantId, shopifyId }, 'Customer deleted');
}

async function handleOrderWebhook(
  tenantId: string,
  topic: string,
  payload: Record<string, unknown>
): Promise<void> {
  const shopifyId = String(payload.id);
  const customerData = payload.customer as Record<string, unknown> | null;
  
  // Find or create customer
  let customerId: string | null = null;
  
  if (customerData?.id) {
    const shopifyCustomerId = String(customerData.id);
    let customer = await prisma.customer.findFirst({
      where: { tenantId, shopifyId: shopifyCustomerId },
    });
    
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId,
          shopifyId: shopifyCustomerId,
          email: (customerData.email as string) || null,
          firstName: (customerData.first_name as string) || null,
          lastName: (customerData.last_name as string) || null,
          ordersCount: 0,
          totalSpent: 0,
          shopifyCreatedAt: new Date(),
        },
      });
    }
    customerId = customer.id;
  }
  
  // Parse line items
  const rawLineItems = payload.line_items as Array<Record<string, unknown>> || [];
  const lineItems = rawLineItems.map(item => ({
    shopifyLineItemId: String(item.id),
    title: item.title as string,
    quantity: item.quantity as number,
    price: parseFloat(item.price as string) || 0,
    sku: (item.sku as string) || null,
    productId: item.product_id ? String(item.product_id) : null,
    variantId: item.variant_id ? String(item.variant_id) : null,
  }));
  
  const orderDate = payload.processed_at 
    ? new Date(payload.processed_at as string) 
    : new Date(payload.created_at as string || Date.now());
  
  const orderData = {
    orderNumber: (payload.order_number as number) || 0,
    orderName: (payload.name as string) || `#${payload.order_number || 0}`,
    financialStatus: mapFinancialStatus(payload.financial_status as string),
    fulfillmentStatus: mapFulfillmentStatus(payload.fulfillment_status as string),
    totalPrice: parseFloat(payload.total_price as string) || 0,
    subtotalPrice: parseFloat(payload.subtotal_price as string) || 0,
    totalTax: parseFloat(payload.total_tax as string) || 0,
    totalDiscounts: parseFloat(payload.total_discounts as string) || 0,
    currency: (payload.currency as string) || 'USD',
    lineItems: lineItems as any,
    lineItemsCount: lineItems.length,
    orderDate,
    orderMonth: `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`,
    cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at as string) : null,
    shopifyUpdatedAt: payload.updated_at ? new Date(payload.updated_at as string) : new Date(),
  };
  
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
  } else {
    await prisma.order.create({
      data: {
        tenantId,
        shopifyId,
        customerId,
        ...orderData,
        shopifyCreatedAt: payload.created_at ? new Date(payload.created_at as string) : new Date(),
      },
    });
  }

  log.info({ tenantId, shopifyId }, 'Order upserted from webhook');

  // Trigger RFM recalculation for customer
  if (customerId) {
    const { rfmQueue } = await import('./queue');
    await rfmQueue.add(`rfm:${customerId}`, {
      tenantId,
      customerId,
      triggeredBy: 'order',
    });
  }
}

async function handleOrderCancellation(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const shopifyId = String(payload.id);
  
  await prisma.order.updateMany({
    where: {
      tenantId,
      shopifyId,
    },
    data: {
      financialStatus: 'VOIDED',
      cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at as string) : new Date(),
    },
  });

  log.info({ tenantId, shopifyId }, 'Order cancelled');
}

function mapFinancialStatus(status: string | null): 'PENDING' | 'AUTHORIZED' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED' {
  const statusMap: Record<string, 'PENDING' | 'AUTHORIZED' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED'> = {
    pending: 'PENDING',
    authorized: 'AUTHORIZED',
    partially_paid: 'PARTIALLY_PAID',
    paid: 'PAID',
    partially_refunded: 'PARTIALLY_REFUNDED',
    refunded: 'REFUNDED',
    voided: 'VOIDED',
  };
  return statusMap[status || ''] || 'PENDING';
}

function mapFulfillmentStatus(status: string | null): 'FULFILLED' | 'PARTIAL' | 'RESTOCKED' | 'PENDING' | null {
  if (!status) return null;
  const statusMap: Record<string, 'FULFILLED' | 'PARTIAL' | 'RESTOCKED' | 'PENDING'> = {
    fulfilled: 'FULFILLED',
    partial: 'PARTIAL',
    restocked: 'RESTOCKED',
    pending: 'PENDING',
  };
  return statusMap[status] || null;
}

/**
 * Process customer sync jobs
 */
async function processCustomerSync(job: Job<CustomerSyncJobData>): Promise<void> {
  const { tenantId, shopDomain, mode, cursor } = job.data;
  log.info({ jobId: job.id, tenantId, mode }, 'Processing customer sync');
  
  const { syncCustomers } = await import('./shopify');
  
  // Create sync job record
  const syncJob = await prisma.syncJob.create({
    data: {
      tenantId,
      resourceType: 'CUSTOMERS',
      mode: mode === 'full' ? 'FULL' : 'INCREMENTAL',
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });
  
  try {
    const result = await syncCustomers(tenantId, {
      fullSync: mode === 'full',
      onProgress: async (processed, total) => {
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: {
            recordsProcessed: processed,
            totalRecords: total,
            progressPercent: total ? Math.round((processed / total) * 100) : 0,
          },
        });
        
        await job.updateProgress({ processed, total });
      },
    });
    
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        recordsProcessed: result.totalProcessed,
        recordsFailed: result.errors,
        progressPercent: 100,
      },
    });
    
    log.info({ tenantId, result }, 'Customer sync completed');
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
}

/**
 * Process order sync jobs
 */
async function processOrderSync(job: Job<OrderSyncJobData>): Promise<void> {
  const { tenantId, shopDomain, mode, cursor, since } = job.data;
  log.info({ jobId: job.id, tenantId, mode }, 'Processing order sync');
  
  const { syncOrders, updateCustomerOrderStats } = await import('./shopify');
  
  // Create sync job record
  const syncJob = await prisma.syncJob.create({
    data: {
      tenantId,
      resourceType: 'ORDERS',
      mode: mode === 'full' ? 'FULL' : 'INCREMENTAL',
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });
  
  try {
    const result = await syncOrders(tenantId, {
      fullSync: mode === 'full',
      onProgress: async (processed, total) => {
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: {
            recordsProcessed: processed,
            totalRecords: total,
            progressPercent: total ? Math.round((processed / total) * 100) : 0,
          },
        });
        
        await job.updateProgress({ processed, total });
      },
    });
    
    // Update customer stats after order sync
    await updateCustomerOrderStats(tenantId);
    
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        recordsProcessed: result.totalProcessed,
        recordsFailed: result.errors,
        progressPercent: 100,
      },
    });
    
    log.info({ tenantId, result }, 'Order sync completed');
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
}

/**
 * Process RFM calculation jobs
 */
async function processRfmCalculation(job: Job<RfmCalculationJobData>): Promise<void> {
  const { tenantId, customerId, triggeredBy } = job.data;
  log.info({ jobId: job.id, tenantId, customerId, triggeredBy }, 'Processing RFM calculation');
  
  const { calculateRfmForCustomer, calculateRfmForTenant } = await import('./analytics/rfm.service');
  const { segmentQueue } = await import('./queue');
  
  try {
    if (customerId) {
      // Single customer RFM calculation (triggered by order event)
      const result = await calculateRfmForCustomer(tenantId, customerId);
      
      if (result) {
        log.info(
          { customerId, rfmSegment: result.rfmSegment },
          'Single customer RFM calculated'
        );
        
        // Trigger segment updates for this customer's segments
        // Find segments that might need updating based on RFM changes
        const customerSegments = await prisma.segmentMember.findMany({
          where: { customerId },
          select: { segmentId: true },
        });
        
        for (const { segmentId } of customerSegments) {
          await segmentQueue.add(`segment:${segmentId}`, {
            tenantId,
            segmentId,
            reason: 'rfm_update',
          }, {
            delay: 5000, // Small delay to batch multiple RFM updates
            jobId: `segment-rfm-${segmentId}-${Date.now()}`,
          });
        }
      }
    } else {
      // Tenant-wide RFM calculation (scheduled or manual trigger)
      const result = await calculateRfmForTenant(tenantId, async (processed, total) => {
        await job.updateProgress({ processed, total });
      });
      
      log.info(
        { tenantId, updated: result.updated, errors: result.errors },
        'Tenant RFM calculation completed'
      );
      
      // Refresh all active segments after tenant-wide RFM recalculation
      const segments = await prisma.segment.findMany({
        where: { tenantId, isActive: true },
        select: { id: true },
      });
      
      for (const { id: segmentId } of segments) {
        await segmentQueue.add(`segment:${segmentId}`, {
          tenantId,
          segmentId,
          reason: 'rfm_update',
        }, {
          delay: 1000, // Stagger segment updates
          jobId: `segment-rfm-batch-${segmentId}-${Date.now()}`,
        });
      }
    }
  } catch (error) {
    log.error({ error, tenantId, customerId }, 'RFM calculation failed');
    throw error;
  }
}

/**
 * Process segment update jobs
 */
async function processSegmentUpdate(job: Job<SegmentUpdateJobData>): Promise<void> {
  const { tenantId, segmentId, reason } = job.data;
  log.info({ jobId: job.id, tenantId, segmentId, reason }, 'Processing segment update');
  
  const { computeSegmentMembership } = await import('./segment/membership.service');
  
  try {
    const result = await computeSegmentMembership(segmentId);
    
    log.info(
      { 
        segmentId,
        previousCount: result.previousCount,
        newCount: result.newCount,
        added: result.added,
        removed: result.removed,
        duration: result.duration,
      },
      'Segment membership updated'
    );
    
    // Report job progress
    await job.updateProgress({
      customerCount: result.newCount,
      added: result.added,
      removed: result.removed,
    });
  } catch (error) {
    log.error({ error, segmentId, reason }, 'Segment update failed');
    throw error;
  }
}

/**
 * Process bulk operation jobs
 */
async function processBulkOperation(job: Job<BulkOperationJobData>): Promise<void> {
  const { tenantId, operationType, filters } = job.data;
  log.info({ jobId: job.id, tenantId, operationType }, 'Processing bulk operation');
  
  // TODO: Implement bulk operations
  // This will be implemented in Day 4
}

// Create workers
export const webhookWorker = new Worker(
  QUEUE_NAMES.WEBHOOK_PROCESSING,
  processWebhook,
  workerOptions
);

export const customerSyncWorker = new Worker(
  QUEUE_NAMES.CUSTOMER_SYNC,
  processCustomerSync,
  workerOptions
);

export const orderSyncWorker = new Worker(
  QUEUE_NAMES.ORDER_SYNC,
  processOrderSync,
  workerOptions
);

export const rfmWorker = new Worker(
  QUEUE_NAMES.RFM_CALCULATION,
  processRfmCalculation,
  { ...workerOptions, concurrency: 10 } // Higher concurrency for RFM
);

export const segmentWorker = new Worker(
  QUEUE_NAMES.SEGMENT_UPDATE,
  processSegmentUpdate,
  workerOptions
);

export const bulkWorker = new Worker(
  QUEUE_NAMES.BULK_OPERATIONS,
  processBulkOperation,
  { ...workerOptions, concurrency: 2 } // Lower concurrency for bulk ops
);

// All workers for management
export const allWorkers = [
  webhookWorker,
  customerSyncWorker,
  orderSyncWorker,
  rfmWorker,
  segmentWorker,
  bulkWorker,
];

// Worker event handlers
for (const worker of allWorkers) {
  worker.on('completed', (job) => {
    log.info({ jobId: job.id, queue: worker.name }, 'Job completed');
  });

  worker.on('failed', (job, error) => {
    log.error({ jobId: job?.id, queue: worker.name, error }, 'Job failed');
  });

  worker.on('error', (error) => {
    log.error({ queue: worker.name, error }, 'Worker error');
  });
}

/**
 * Gracefully close all workers
 */
export async function closeAllWorkers(): Promise<void> {
  log.info('Closing all workers...');
  await Promise.all(allWorkers.map((worker) => worker.close()));
  log.info('All workers closed');
}
