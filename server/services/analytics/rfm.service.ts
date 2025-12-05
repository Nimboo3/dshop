/**
 * RFM (Recency, Frequency, Monetary) Analysis Service
 * 
 * Uses NTILE window functions to score customers 1-5 on each dimension,
 * then maps scores to one of 11 behavioral segments.
 */

import { RFMSegment, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';

const log = logger.child({ module: 'rfm-service' });

// Result type from raw SQL query
interface RfmScoreRow {
  id: string;
  tenant_id: string;
  total_spent: string | number;
  orders_count: number;
  days_since_last_order: number;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
}

// Calculation result for a single customer
export interface RfmResult {
  customerId: string;
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  rfmSegment: RFMSegment;
  isHighValue: boolean;
  isChurnRisk: boolean;
}

// Batch calculation result
export interface RfmBatchResult {
  tenantId: string;
  totalCustomers: number;
  updated: number;
  skipped: number;
  errors: number;
  duration: number;
}

// Segment distribution stats
export interface RfmSegmentStats {
  segment: RFMSegment;
  count: number;
  totalSpent: number;
  avgOrderValue: number;
  percentage: number;
}

/**
 * Determine RFM segment based on R, F, M scores (1-5 scale)
 * 
 * Segment mapping based on standard RFM analysis:
 * - Champions: Best customers (high on all dimensions)
 * - Loyal: Consistent buyers
 * - Potential Loyalists: Recent with growth potential
 * - etc.
 */
export function determineRfmSegment(r: number, f: number, m: number): RFMSegment {
  // Score is 1-5 where 5 is best
  // R: Higher = more recent (better)
  // F: Higher = more frequent (better)
  // M: Higher = more monetary (better)

  // Champions: Best on all dimensions (5,5,5 or 5,4,5 or 4,5,5 etc)
  if (r >= 4 && f >= 4 && m >= 4) {
    return RFMSegment.CHAMPIONS;
  }

  // Loyal Customers: High frequency and monetary, decent recency
  if (r >= 3 && f >= 4 && m >= 3) {
    return RFMSegment.LOYAL;
  }

  // Cannot Lose: Were great customers but haven't bought recently
  if (r <= 2 && f >= 4 && m >= 4) {
    return RFMSegment.CANNOT_LOSE;
  }

  // At Risk: Good customers showing signs of leaving
  if (r <= 3 && r >= 2 && f >= 3 && m >= 3) {
    return RFMSegment.AT_RISK;
  }

  // New Customers: Just arrived, one purchase
  if (r >= 4 && f === 1 && m <= 2) {
    return RFMSegment.NEW_CUSTOMERS;
  }

  // Promising: Recent buyers with potential
  if (r >= 4 && f <= 2 && m <= 2) {
    return RFMSegment.PROMISING;
  }

  // Potential Loyalists: Recent, moderate frequency
  if (r >= 3 && f >= 2 && f <= 3 && m >= 2) {
    return RFMSegment.POTENTIAL_LOYALIST;
  }

  // Need Attention: Above average but need engagement
  if (r >= 2 && r <= 3 && f >= 2 && f <= 3 && m >= 2 && m <= 3) {
    return RFMSegment.NEED_ATTENTION;
  }

  // About to Sleep: Below average, declining
  if (r >= 2 && r <= 3 && f <= 2 && m <= 2) {
    return RFMSegment.ABOUT_TO_SLEEP;
  }

  // Hibernating: Low on all dimensions but not completely lost
  if (r <= 2 && f <= 2 && m <= 2 && (r > 1 || f > 1 || m > 1)) {
    return RFMSegment.HIBERNATING;
  }

  // Lost: Lowest scores
  return RFMSegment.LOST;
}

/**
 * Calculate P90 threshold for high-value customer determination
 */
async function getHighValueThreshold(tenantId: string): Promise<number> {
  const result = await prisma.$queryRaw<[{ p90: number | null }]>`
    SELECT PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_spent) as p90
    FROM customers
    WHERE tenant_id = ${tenantId}
      AND orders_count > 0
  `;
  
  return result[0]?.p90 ?? 0;
}

/**
 * Calculate RFM scores for a single customer
 * 
 * For single customer calculation, we need tenant-wide context to determine
 * relative scores. This recalculates scores based on current tenant distribution.
 */
export async function calculateRfmForCustomer(
  tenantId: string,
  customerId: string
): Promise<RfmResult | null> {
  log.info({ tenantId, customerId }, 'Calculating RFM for single customer');

  // Get customer's current metrics
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      totalSpent: true,
      ordersCount: true,
      lastOrderDate: true,
    },
  });

  if (!customer || !customer.lastOrderDate) {
    log.warn({ customerId }, 'Customer not found or has no orders');
    return null;
  }

  const daysSinceLastOrder = Math.floor(
    (Date.now() - customer.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Get tenant percentiles for scoring
  const percentiles = await prisma.$queryRaw<[{
    r_p20: number; r_p40: number; r_p60: number; r_p80: number;
    f_p20: number; f_p40: number; f_p60: number; f_p80: number;
    m_p20: number; m_p40: number; m_p60: number; m_p80: number;
    p90_spent: number;
  }]>`
    SELECT
      PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM NOW() - last_order_date)::int) as r_p20,
      PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM NOW() - last_order_date)::int) as r_p40,
      PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM NOW() - last_order_date)::int) as r_p60,
      PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM NOW() - last_order_date)::int) as r_p80,
      PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY orders_count) as f_p20,
      PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY orders_count) as f_p40,
      PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY orders_count) as f_p60,
      PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY orders_count) as f_p80,
      PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY total_spent) as m_p20,
      PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY total_spent) as m_p40,
      PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY total_spent) as m_p60,
      PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY total_spent) as m_p80,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_spent) as p90_spent
    FROM customers
    WHERE tenant_id = ${tenantId}
      AND last_order_date IS NOT NULL
      AND orders_count > 0
  `;

  const p = percentiles[0];
  if (!p) {
    log.warn({ tenantId }, 'No percentile data available');
    return null;
  }

  // Calculate scores (recency inverted: fewer days = higher score)
  const recencyScore = daysSinceLastOrder <= p.r_p20 ? 5
    : daysSinceLastOrder <= p.r_p40 ? 4
    : daysSinceLastOrder <= p.r_p60 ? 3
    : daysSinceLastOrder <= p.r_p80 ? 2
    : 1;

  const frequencyScore = customer.ordersCount >= p.f_p80 ? 5
    : customer.ordersCount >= p.f_p60 ? 4
    : customer.ordersCount >= p.f_p40 ? 3
    : customer.ordersCount >= p.f_p20 ? 2
    : 1;

  const monetaryScore = Number(customer.totalSpent) >= p.m_p80 ? 5
    : Number(customer.totalSpent) >= p.m_p60 ? 4
    : Number(customer.totalSpent) >= p.m_p40 ? 3
    : Number(customer.totalSpent) >= p.m_p20 ? 2
    : 1;

  const rfmSegment = determineRfmSegment(recencyScore, frequencyScore, monetaryScore);
  const isHighValue = Number(customer.totalSpent) >= p.p90_spent;
  const isChurnRisk = daysSinceLastOrder >= 90;

  // Update customer record
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      daysSinceLastOrder,
      recencyScore,
      frequencyScore,
      monetaryScore,
      rfmSegment,
      rfmComputedAt: new Date(),
      isHighValue,
      isChurnRisk,
    },
  });

  log.info(
    { customerId, recencyScore, frequencyScore, monetaryScore, rfmSegment },
    'RFM calculated for customer'
  );

  return {
    customerId,
    recencyScore,
    frequencyScore,
    monetaryScore,
    rfmSegment,
    isHighValue,
    isChurnRisk,
  };
}

/**
 * Calculate RFM scores for all customers in a tenant
 * 
 * Uses NTILE window functions to efficiently score all customers at once.
 * This is the primary method for batch/scheduled RFM updates.
 */
export async function calculateRfmForTenant(
  tenantId: string,
  onProgress?: (processed: number, total: number) => Promise<void>
): Promise<RfmBatchResult> {
  const startTime = Date.now();
  log.info({ tenantId }, 'Starting tenant-wide RFM calculation');

  // Count eligible customers (have at least one order)
  const totalCustomers = await prisma.customer.count({
    where: {
      tenantId,
      lastOrderDate: { not: null },
      ordersCount: { gt: 0 },
    },
  });

  if (totalCustomers === 0) {
    log.info({ tenantId }, 'No eligible customers for RFM calculation');
    return {
      tenantId,
      totalCustomers: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      duration: Date.now() - startTime,
    };
  }

  // Use raw SQL with NTILE for efficient batch scoring
  const scoredCustomers = await prisma.$queryRaw<RfmScoreRow[]>`
    WITH customer_metrics AS (
      SELECT 
        id,
        tenant_id,
        total_spent,
        orders_count,
        EXTRACT(DAY FROM NOW() - last_order_date)::int as days_since_last_order
      FROM customers
      WHERE tenant_id = ${tenantId}
        AND last_order_date IS NOT NULL
        AND orders_count > 0
    ),
    rfm_scored AS (
      SELECT 
        id,
        tenant_id,
        total_spent,
        orders_count,
        days_since_last_order,
        -- Recency: Lower days = higher score (invert with DESC)
        NTILE(5) OVER (ORDER BY days_since_last_order DESC) as recency_score,
        -- Frequency: Higher count = higher score
        NTILE(5) OVER (ORDER BY orders_count ASC) as frequency_score,
        -- Monetary: Higher spent = higher score
        NTILE(5) OVER (ORDER BY total_spent ASC) as monetary_score
      FROM customer_metrics
    )
    SELECT * FROM rfm_scored
  `;

  // Get P90 threshold for high-value flag
  const highValueThreshold = await getHighValueThreshold(tenantId);
  
  let updated = 0;
  let errors = 0;
  const batchSize = 100;

  // Process in batches
  for (let i = 0; i < scoredCustomers.length; i += batchSize) {
    const batch = scoredCustomers.slice(i, i + batchSize);
    
    try {
      await prisma.$transaction(
        batch.map((row) => {
          const rfmSegment = determineRfmSegment(
            row.recency_score,
            row.frequency_score,
            row.monetary_score
          );
          
          const totalSpent = typeof row.total_spent === 'string' 
            ? parseFloat(row.total_spent) 
            : row.total_spent;

          return prisma.customer.update({
            where: { id: row.id },
            data: {
              daysSinceLastOrder: row.days_since_last_order,
              recencyScore: row.recency_score,
              frequencyScore: row.frequency_score,
              monetaryScore: row.monetary_score,
              rfmSegment,
              rfmComputedAt: new Date(),
              isHighValue: totalSpent >= highValueThreshold,
              isChurnRisk: row.days_since_last_order >= 90,
            },
          });
        })
      );
      
      updated += batch.length;
    } catch (error) {
      log.error({ error, batchStart: i }, 'Batch update failed');
      errors += batch.length;
    }

    // Report progress
    if (onProgress) {
      await onProgress(updated + errors, totalCustomers);
    }
  }

  const duration = Date.now() - startTime;
  log.info(
    { tenantId, totalCustomers, updated, errors, duration },
    'Tenant RFM calculation complete'
  );

  return {
    tenantId,
    totalCustomers,
    updated,
    skipped: 0,
    errors,
    duration,
  };
}

/**
 * Get RFM segment distribution for a tenant
 */
export async function getRfmSegmentDistribution(
  tenantId: string
): Promise<RfmSegmentStats[]> {
  const totalCustomers = await prisma.customer.count({
    where: { tenantId, rfmSegment: { not: null } },
  });

  if (totalCustomers === 0) {
    return [];
  }

  const segments = await prisma.customer.groupBy({
    by: ['rfmSegment'],
    where: {
      tenantId,
      rfmSegment: { not: null },
    },
    _count: { id: true },
    _sum: { totalSpent: true },
    _avg: { avgOrderValue: true },
  });

  return segments.map((seg) => ({
    segment: seg.rfmSegment!,
    count: seg._count.id,
    totalSpent: Number(seg._sum.totalSpent ?? 0),
    avgOrderValue: Number(seg._avg.avgOrderValue ?? 0),
    percentage: Math.round((seg._count.id / totalCustomers) * 100 * 10) / 10,
  }));
}

/**
 * Get RFM matrix data (3D distribution of R, F, M scores)
 */
export async function getRfmMatrix(tenantId: string): Promise<{
  matrix: Array<{ r: number; f: number; m: number; count: number }>;
  totalCustomers: number;
}> {
  const matrix = await prisma.customer.groupBy({
    by: ['recencyScore', 'frequencyScore', 'monetaryScore'],
    where: {
      tenantId,
      recencyScore: { not: null },
      frequencyScore: { not: null },
      monetaryScore: { not: null },
    },
    _count: { id: true },
  });

  const totalCustomers = await prisma.customer.count({
    where: { tenantId, rfmSegment: { not: null } },
  });

  return {
    matrix: matrix.map((cell) => ({
      r: cell.recencyScore!,
      f: cell.frequencyScore!,
      m: cell.monetaryScore!,
      count: cell._count.id,
    })),
    totalCustomers,
  };
}

/**
 * Get customers by RFM segment
 */
export async function getCustomersBySegment(
  tenantId: string,
  segment: RFMSegment,
  options: {
    limit?: number;
    offset?: number;
    sortBy?: 'totalSpent' | 'lastOrderDate' | 'ordersCount';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  customers: Array<{
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    totalSpent: number;
    ordersCount: number;
    lastOrderDate: Date | null;
    recencyScore: number | null;
    frequencyScore: number | null;
    monetaryScore: number | null;
  }>;
  total: number;
}> {
  const { limit = 50, offset = 0, sortBy = 'totalSpent', sortOrder = 'desc' } = options;

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, rfmSegment: segment },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderDate: true,
        recencyScore: true,
        frequencyScore: true,
        monetaryScore: true,
      },
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    }),
    prisma.customer.count({
      where: { tenantId, rfmSegment: segment },
    }),
  ]);

  return {
    customers: customers.map((c) => ({
      ...c,
      totalSpent: Number(c.totalSpent),
    })),
    total,
  };
}
