/**
 * Orders API Routes
 * 
 * Dedicated endpoints for order data with filtering and pagination.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { tenantMiddleware } from '../middleware';

const log = logger.child({ module: 'orders-routes' });

export const ordersRouter = Router();

// All routes require tenant context
ordersRouter.use(tenantMiddleware);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'totalPrice', 'orderNumber']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['pending', 'paid', 'refunded', 'cancelled', 'any']).default('any'),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
});

// ============================================================================
// ORDER ROUTES
// ============================================================================

/**
 * GET /api/orders
 * Get paginated list of orders with filtering
 */
ordersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    
    // Parse and validate query params
    const query = ordersQuerySchema.parse(req.query);
    const { page, limit, sortBy, sortOrder, startDate, endDate, status, minAmount, maxAmount, customerId, search } = query;

    // Build where clause
    const where: Prisma.OrderWhereInput = {
      tenantId,
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Status filter
    if (status && status !== 'any') {
      where.financialStatus = status.toUpperCase() as 'PENDING' | 'PAID' | 'REFUNDED' | 'VOIDED';
    }

    // Amount range filter
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.totalPrice = {};
      if (minAmount !== undefined) {
        where.totalPrice.gte = minAmount;
      }
      if (maxAmount !== undefined) {
        where.totalPrice.lte = maxAmount;
      }
    }

    // Customer filter
    if (customerId) {
      where.customerId = customerId;
    }

    // Search filter (order name)
    if (search) {
      where.orderName = { contains: search, mode: 'insensitive' };
    }

    // Get total count
    const total = await prisma.order.count({ where });

    // Get orders with customer info
    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      orders: orders.map(order => ({
        id: order.id,
        shopifyId: order.shopifyId,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        totalPrice: Number(order.totalPrice),
        subtotalPrice: Number(order.subtotalPrice),
        totalTax: order.totalTax ? Number(order.totalTax) : null,
        currency: order.currency,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
        orderDate: order.orderDate,
        customer: order.customer ? {
          id: order.customer.id,
          email: order.customer.email,
          name: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || null,
        } : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/orders/:id
 * Get single order by ID
 */
ordersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        customer: {
          select: {
            id: true,
            shopifyId: true,
            email: true,
            firstName: true,
            lastName: true,
            totalSpent: true,
            ordersCount: true,
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    // Parse lineItems from JSON
    const lineItems = order.lineItems as Array<{
      id?: string;
      title: string;
      quantity: number;
      price: number;
      sku?: string;
      variantTitle?: string;
    }> | null;

    res.json({
      id: order.id,
      shopifyId: order.shopifyId,
      orderNumber: order.orderNumber,
      orderName: order.orderName,
      totalPrice: Number(order.totalPrice),
      subtotalPrice: Number(order.subtotalPrice),
      totalTax: order.totalTax ? Number(order.totalTax) : null,
      totalDiscounts: order.totalDiscounts ? Number(order.totalDiscounts) : null,
      currency: order.currency,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      createdAt: order.createdAt,
      orderDate: order.orderDate,
      cancelledAt: order.cancelledAt,
      customer: order.customer ? {
        id: order.customer.id,
        shopifyId: order.customer.shopifyId,
        email: order.customer.email,
        name: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || null,
        totalSpent: Number(order.customer.totalSpent),
        ordersCount: order.customer.ordersCount,
      } : null,
      lineItems: lineItems?.map(item => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: Number(item.price),
        sku: item.sku,
        variantTitle: item.variantTitle,
      })) || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/stats/summary
 * Get order statistics summary
 */
ordersRouter.get('/stats/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;

    // Parse date range from query
    const { startDate, endDate } = req.query;

    const dateFilter: Prisma.OrderWhereInput = {
      tenantId,
    };

    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.createdAt.lte = new Date(endDate as string);
      }
    }

    // Get aggregated stats
    const [stats, statusCounts, recentOrders] = await Promise.all([
      prisma.order.aggregate({
        where: dateFilter,
        _count: { id: true },
        _sum: { totalPrice: true },
        _avg: { totalPrice: true },
      }),
      prisma.order.groupBy({
        by: ['financialStatus'],
        where: dateFilter,
        _count: { id: true },
      }),
      prisma.order.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    res.json({
      summary: {
        totalOrders: stats._count.id,
        totalRevenue: stats._sum.totalPrice ? Number(stats._sum.totalPrice) : 0,
        averageOrderValue: stats._avg.totalPrice ? Number(stats._avg.totalPrice) : 0,
      },
      byStatus: statusCounts.map(s => ({
        status: s.financialStatus,
        count: s._count.id,
      })),
      recentOrders: recentOrders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        totalPrice: Number(order.totalPrice),
        createdAt: order.createdAt,
        customerName: order.customer 
          ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || order.customer.email
          : 'Guest',
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/stats/daily
 * Get daily order stats for charts
 */
ordersRouter.get('/stats/daily', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    
    // Default to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Parse custom date range if provided
    if (req.query.startDate) {
      startDate.setTime(new Date(req.query.startDate as string).getTime());
    }
    if (req.query.endDate) {
      endDate.setTime(new Date(req.query.endDate as string).getTime());
    }

    // Raw SQL for daily aggregation
    const dailyStats = await prisma.$queryRaw<Array<{
      date: Date;
      count: bigint;
      revenue: number;
    }>>`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) as count,
        COALESCE(SUM("totalPrice"), 0) as revenue
      FROM "Order"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // Fill in missing dates with zeros
    const dateMap = new Map<string, { count: number; revenue: number }>();
    dailyStats.forEach(row => {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      dateMap.set(dateStr, {
        count: Number(row.count),
        revenue: Number(row.revenue),
      });
    });

    const result: Array<{ date: string; orders: number; revenue: number }> = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const data = dateMap.get(dateStr) || { count: 0, revenue: 0 };
      result.push({
        date: dateStr,
        orders: data.count,
        revenue: data.revenue,
      });
      current.setDate(current.getDate() + 1);
    }

    res.json({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/by-customer/:customerId
 * Get all orders for a specific customer
 */
ordersRouter.get('/by-customer/:customerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { customerId } = req.params;
    const { limit = '20', page = '1' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          tenantId,
          customerId,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.order.count({
        where: {
          tenantId,
          customerId,
        },
      }),
    ]);

    res.json({
      orders: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        totalPrice: Number(order.totalPrice),
        currency: order.currency,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
});
