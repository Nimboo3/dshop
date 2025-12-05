/**
 * Analytics API Routes
 * 
 * RFM analysis, cohorts, and customer insights endpoints.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RFMSegment } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { tenantMiddleware } from '../middleware';
import { rfmQueue } from '../services/queue';
import {
  getRfmSegmentDistribution,
  getRfmMatrix,
  getCustomersBySegment,
  calculateRfmForTenant,
} from '../services/analytics';

const log = logger.child({ module: 'analytics-routes' });

export const analyticsRouter = Router();

// All routes require tenant context
analyticsRouter.use(tenantMiddleware);

// ============================================================================
// RFM ANALYSIS ROUTES
// ============================================================================

/**
 * GET /api/analytics/rfm/distribution
 * Get RFM segment distribution for tenant
 */
analyticsRouter.get('/rfm/distribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;

    const distribution = await getRfmSegmentDistribution(tenantId);

    // Calculate totals
    const totalCustomers = distribution.reduce((sum, s) => sum + s.count, 0);
    const totalRevenue = distribution.reduce((sum, s) => sum + s.totalSpent, 0);

    res.json({
      distribution,
      summary: {
        totalCustomers,
        totalRevenue,
        segmentsWithCustomers: distribution.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/rfm/matrix
 * Get 3D RFM matrix (R x F x M score distribution)
 */
analyticsRouter.get('/rfm/matrix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;

    const result = await getRfmMatrix(tenantId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/rfm/segments/:segment
 * Get customers in a specific RFM segment
 */
analyticsRouter.get('/rfm/segments/:segment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { segment } = req.params;
    const { limit, offset, sortBy, sortOrder } = req.query;

    // Validate segment enum
    if (!Object.values(RFMSegment).includes(segment as RFMSegment)) {
      res.status(400).json({
        error: 'Invalid RFM segment',
        validSegments: Object.values(RFMSegment),
      });
      return;
    }

    const result = await getCustomersBySegment(tenantId, segment as RFMSegment, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      sortBy: sortBy as 'totalSpent' | 'lastOrderDate' | 'ordersCount' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.json({
      segment,
      customers: result.customers,
      total: result.total,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/analytics/rfm/recalculate
 * Trigger tenant-wide RFM recalculation
 */
analyticsRouter.post('/rfm/recalculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;

    // Queue RFM calculation job
    const job = await rfmQueue.add(`rfm:tenant:${tenantId}`, {
      tenantId,
      triggeredBy: 'manual',
    });

    log.info({ tenantId, jobId: job.id }, 'RFM recalculation queued');

    res.json({
      message: 'RFM recalculation queued',
      jobId: job.id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/rfm/summary
 * Get high-level RFM summary stats
 */
analyticsRouter.get('/rfm/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;

    // Get counts by key segments
    const [
      totalCustomers,
      customersWithRfm,
      champions,
      atRisk,
      lost,
      highValue,
      churnRisk,
      lastComputedAt,
    ] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId, rfmSegment: { not: null } } }),
      prisma.customer.count({ where: { tenantId, rfmSegment: RFMSegment.CHAMPIONS } }),
      prisma.customer.count({ where: { tenantId, rfmSegment: RFMSegment.AT_RISK } }),
      prisma.customer.count({ where: { tenantId, rfmSegment: RFMSegment.LOST } }),
      prisma.customer.count({ where: { tenantId, isHighValue: true } }),
      prisma.customer.count({ where: { tenantId, isChurnRisk: true } }),
      prisma.customer.findFirst({
        where: { tenantId, rfmComputedAt: { not: null } },
        orderBy: { rfmComputedAt: 'desc' },
        select: { rfmComputedAt: true },
      }),
    ]);

    res.json({
      totalCustomers,
      customersWithRfm,
      rfmCoverage: totalCustomers > 0 
        ? Math.round((customersWithRfm / totalCustomers) * 100) 
        : 0,
      keySegments: {
        champions,
        atRisk,
        lost,
      },
      flags: {
        highValue,
        churnRisk,
      },
      lastComputedAt: lastComputedAt?.rfmComputedAt ?? null,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// COHORT ANALYSIS ROUTES
// ============================================================================

/**
 * GET /api/analytics/cohorts/monthly
 * Get monthly customer cohort analysis
 */
analyticsRouter.get('/cohorts/monthly', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { months = '6' } = req.query;
    const monthsBack = parseInt(months as string, 10);

    // Get cohorts by first order month
    const cohorts = await prisma.$queryRaw<Array<{
      cohort_month: string;
      customer_count: bigint;
      total_revenue: number;
      avg_order_value: number;
      avg_orders_per_customer: number;
    }>>`
      SELECT
        TO_CHAR(first_order_date, 'YYYY-MM') as cohort_month,
        COUNT(*) as customer_count,
        SUM(total_spent)::float as total_revenue,
        AVG(avg_order_value)::float as avg_order_value,
        AVG(orders_count)::float as avg_orders_per_customer
      FROM customers
      WHERE tenant_id = ${tenantId}
        AND first_order_date IS NOT NULL
        AND first_order_date >= NOW() - INTERVAL '${monthsBack} months'
      GROUP BY TO_CHAR(first_order_date, 'YYYY-MM')
      ORDER BY cohort_month DESC
    `;

    res.json({
      cohorts: cohorts.map((c) => ({
        month: c.cohort_month,
        customerCount: Number(c.customer_count),
        totalRevenue: c.total_revenue ?? 0,
        avgOrderValue: c.avg_order_value ?? 0,
        avgOrdersPerCustomer: c.avg_orders_per_customer ?? 0,
      })),
      months: monthsBack,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/cohorts/retention
 * Get customer retention by cohort
 */
analyticsRouter.get('/cohorts/retention', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { months = '6' } = req.query;
    const monthsBack = parseInt(months as string, 10);

    // Complex retention query using window functions
    const retention = await prisma.$queryRaw<Array<{
      cohort_month: string;
      month_number: number;
      retained_customers: bigint;
      retention_rate: number;
    }>>`
      WITH cohorts AS (
        SELECT
          id as customer_id,
          TO_CHAR(first_order_date, 'YYYY-MM') as cohort_month,
          first_order_date
        FROM customers
        WHERE tenant_id = ${tenantId}
          AND first_order_date IS NOT NULL
          AND first_order_date >= NOW() - INTERVAL '${monthsBack} months'
      ),
      cohort_sizes AS (
        SELECT cohort_month, COUNT(*) as cohort_size
        FROM cohorts
        GROUP BY cohort_month
      ),
      monthly_activity AS (
        SELECT DISTINCT
          c.cohort_month,
          c.customer_id,
          EXTRACT(MONTH FROM AGE(o.order_date, c.first_order_date))::int as month_number
        FROM cohorts c
        INNER JOIN orders o ON c.customer_id = o.customer_id
        WHERE o.tenant_id = ${tenantId}
          AND o.financial_status IN ('PAID', 'PARTIALLY_PAID')
      )
      SELECT
        ma.cohort_month,
        ma.month_number,
        COUNT(DISTINCT ma.customer_id) as retained_customers,
        (COUNT(DISTINCT ma.customer_id)::float / cs.cohort_size * 100)::float as retention_rate
      FROM monthly_activity ma
      INNER JOIN cohort_sizes cs ON ma.cohort_month = cs.cohort_month
      WHERE ma.month_number <= 6
      GROUP BY ma.cohort_month, ma.month_number, cs.cohort_size
      ORDER BY ma.cohort_month DESC, ma.month_number ASC
    `;

    res.json({
      retention: retention.map((r) => ({
        cohortMonth: r.cohort_month,
        monthNumber: r.month_number,
        retainedCustomers: Number(r.retained_customers),
        retentionRate: Math.round(r.retention_rate * 10) / 10,
      })),
      months: monthsBack,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// REVENUE ANALYTICS
// ============================================================================

/**
 * GET /api/analytics/revenue/trend
 * Get daily revenue trend
 */
analyticsRouter.get('/revenue/trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { days = '30' } = req.query;
    const daysBack = parseInt(days as string, 10);

    const trend = await prisma.$queryRaw<Array<{
      date: Date;
      order_count: bigint;
      revenue: number;
      unique_customers: bigint;
    }>>`
      SELECT
        DATE(order_date) as date,
        COUNT(*) as order_count,
        SUM(total_price)::float as revenue,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND order_date >= NOW() - INTERVAL '${daysBack} days'
        AND financial_status IN ('PAID', 'PARTIALLY_PAID')
      GROUP BY DATE(order_date)
      ORDER BY date DESC
    `;

    res.json({
      trend: trend.map((t) => ({
        date: t.date,
        orderCount: Number(t.order_count),
        revenue: t.revenue ?? 0,
        uniqueCustomers: Number(t.unique_customers),
      })),
      days: daysBack,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/revenue/summary
 * Get revenue summary stats
 */
analyticsRouter.get('/revenue/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;

    const [today, week, month, allTime] = await Promise.all([
      prisma.order.aggregate({
        where: {
          tenantId,
          orderDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: {
          tenantId,
          orderDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: {
          tenantId,
          orderDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: {
          tenantId,
          financialStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
    ]);

    res.json({
      today: {
        revenue: Number(today._sum.totalPrice ?? 0),
        orders: today._count.id,
      },
      week: {
        revenue: Number(week._sum.totalPrice ?? 0),
        orders: week._count.id,
      },
      month: {
        revenue: Number(month._sum.totalPrice ?? 0),
        orders: month._count.id,
      },
      allTime: {
        revenue: Number(allTime._sum.totalPrice ?? 0),
        orders: allTime._count.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CUSTOMER INSIGHTS
// ============================================================================

/**
 * GET /api/analytics/customers/top
 * Get top customers by various metrics
 */
analyticsRouter.get('/customers/top', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { metric = 'totalSpent', limit = '10' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const validMetrics = ['totalSpent', 'ordersCount', 'avgOrderValue'];
    if (!validMetrics.includes(metric as string)) {
      res.status(400).json({
        error: 'Invalid metric',
        validMetrics,
      });
      return;
    }

    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { [metric as string]: 'desc' },
      take: limitNum,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        totalSpent: true,
        ordersCount: true,
        avgOrderValue: true,
        rfmSegment: true,
        lastOrderDate: true,
      },
    });

    res.json({
      metric,
      customers: customers.map((c) => ({
        ...c,
        totalSpent: Number(c.totalSpent),
        avgOrderValue: Number(c.avgOrderValue),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/customers/churn-risk
 * Get customers at risk of churning
 */
analyticsRouter.get('/customers/churn-risk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { limit = '50' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        isChurnRisk: true,
        ordersCount: { gt: 1 }, // Only customers who have purchased more than once
      },
      orderBy: { totalSpent: 'desc' }, // Prioritize high-value churning customers
      take: limitNum,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderDate: true,
        daysSinceLastOrder: true,
        rfmSegment: true,
      },
    });

    res.json({
      customers: customers.map((c) => ({
        ...c,
        totalSpent: Number(c.totalSpent),
      })),
      total: await prisma.customer.count({
        where: { tenantId, isChurnRisk: true, ordersCount: { gt: 1 } },
      }),
    });
  } catch (error) {
    next(error);
  }
});
