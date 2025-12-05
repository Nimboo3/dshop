/**
 * Segments API Routes
 * 
 * CRUD operations for customer segments with filter DSL support.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { tenantMiddleware } from '../middleware';
import { segmentQueue } from '../services/queue';
import {
  CreateSegmentRequest,
  UpdateSegmentRequest,
  PreviewSegmentRequest,
  validateSegmentFilters,
  SegmentFilters,
} from '../types/segment.types';
import {
  createSegment,
  updateSegment,
  deleteSegment,
  getSegment,
  listSegments,
  getSegmentMembers,
  computeSegmentMembership,
  getSegmentOverlap,
  getCustomerSegments,
} from '../services/segment';
import { previewSegmentCustomers, validateFiltersExecutable } from '../services/segment/evaluator.service';

const log = logger.child({ module: 'segments-routes' });

export const segmentsRouter = Router();

// All routes require tenant context
segmentsRouter.use(tenantMiddleware);

// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================

function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

// ============================================================================
// SEGMENT CRUD ROUTES
// ============================================================================

/**
 * GET /api/segments
 * List all segments for tenant
 */
segmentsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { isActive, limit, offset, sortBy, sortOrder } = req.query;

    const result = await listSegments(tenantId, {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      sortBy: sortBy as 'name' | 'customerCount' | 'createdAt' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.json({
      segments: result.segments,
      total: result.total,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/segments/:id
 * Get segment by ID with stats
 */
segmentsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;

    const segment = await getSegment(id);

    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    // Verify segment belongs to tenant
    const dbSegment = await prisma.segment.findFirst({
      where: { id, tenantId },
    });

    if (!dbSegment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    res.json({ segment });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/segments
 * Create a new segment
 */
segmentsRouter.post(
  '/',
  validateBody(CreateSegmentRequest),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { name, description, filters, isActive } = req.body as CreateSegmentRequest;

      // Validate filters are executable
      const validation = validateFiltersExecutable(filters);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid filter configuration',
          details: validation.errors,
        });
        return;
      }

      const segment = await createSegment(tenantId, {
        name,
        description,
        filters,
        isActive,
      });

      // Queue initial membership computation
      await segmentQueue.add(`segment:${segment.id}`, {
        tenantId,
        segmentId: segment.id,
        reason: 'definition_change',
      });

      log.info({ segmentId: segment.id, name }, 'Segment created');

      res.status(201).json({
        segment,
        message: 'Segment created. Membership computation queued.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/segments/:id
 * Update segment definition
 */
segmentsRouter.put(
  '/:id',
  validateBody(UpdateSegmentRequest),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { id } = req.params;
      const { name, description, filters, isActive } = req.body as UpdateSegmentRequest;

      // Verify segment belongs to tenant
      const existing = await prisma.segment.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Segment not found' });
        return;
      }

      // Validate filters if provided
      if (filters) {
        const validation = validateFiltersExecutable(filters);
        if (!validation.valid) {
          res.status(400).json({
            error: 'Invalid filter configuration',
            details: validation.errors,
          });
          return;
        }
      }

      const segment = await updateSegment(id, {
        name,
        description,
        filters,
        isActive,
      });

      // Recompute membership if filters changed
      if (filters) {
        await segmentQueue.add(`segment:${id}`, {
          tenantId,
          segmentId: id,
          reason: 'definition_change',
        });
      }

      log.info({ segmentId: id }, 'Segment updated');

      res.json({
        segment,
        message: filters ? 'Segment updated. Membership recomputation queued.' : 'Segment updated.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/segments/:id
 * Delete segment
 */
segmentsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;

    // Verify segment belongs to tenant
    const existing = await prisma.segment.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    await deleteSegment(id);

    log.info({ segmentId: id }, 'Segment deleted');

    res.json({ message: 'Segment deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SEGMENT MEMBERSHIP ROUTES
// ============================================================================

/**
 * GET /api/segments/:id/members
 * Get segment members with customer details
 */
segmentsRouter.get('/:id/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;
    const { limit, offset, sortBy, sortOrder } = req.query;

    // Verify segment belongs to tenant
    const existing = await prisma.segment.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    const result = await getSegmentMembers(id, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      sortBy: sortBy as 'addedAt' | 'totalSpentSnapshot' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.json({
      members: result.members,
      total: result.total,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/segments/:id/recompute
 * Manually trigger segment membership recomputation
 */
segmentsRouter.post('/:id/recompute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { id } = req.params;

    // Verify segment belongs to tenant
    const existing = await prisma.segment.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    // Queue recomputation
    await segmentQueue.add(`segment:${id}`, {
      tenantId,
      segmentId: id,
      reason: 'scheduled',
    });

    log.info({ segmentId: id }, 'Segment recomputation queued');

    res.json({ message: 'Segment recomputation queued' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SEGMENT PREVIEW & VALIDATION
// ============================================================================

/**
 * POST /api/segments/preview
 * Preview matching customers without creating segment
 */
segmentsRouter.post(
  '/preview',
  validateBody(PreviewSegmentRequest),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { filters, limit } = req.body as PreviewSegmentRequest;

      // Validate filters
      const validation = validateFiltersExecutable(filters);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid filter configuration',
          details: validation.errors,
        });
        return;
      }

      const result = await previewSegmentCustomers(tenantId, filters, limit);

      res.json({
        customers: result.customers,
        totalCount: result.totalCount,
        estimatedRevenue: result.estimatedRevenue,
        previewLimit: limit,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/segments/validate
 * Validate segment filter DSL
 */
segmentsRouter.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filters } = req.body;

    // Schema validation
    const schemaValidation = validateSegmentFilters(filters);
    if (!schemaValidation.success) {
      res.json({
        valid: false,
        schemaErrors: schemaValidation.error,
      });
      return;
    }

    // Execution validation
    const execValidation = validateFiltersExecutable(schemaValidation.data!);
    
    res.json({
      valid: execValidation.valid,
      errors: execValidation.errors.length > 0 ? execValidation.errors : undefined,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SEGMENT ANALYTICS
// ============================================================================

/**
 * POST /api/segments/overlap
 * Analyze overlap between multiple segments
 */
segmentsRouter.post('/overlap', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenant!.id;
    const { segmentIds } = req.body;

    if (!Array.isArray(segmentIds) || segmentIds.length < 2) {
      res.status(400).json({ error: 'At least 2 segment IDs required' });
      return;
    }

    // Verify all segments belong to tenant
    const segments = await prisma.segment.findMany({
      where: { id: { in: segmentIds }, tenantId },
      select: { id: true },
    });

    if (segments.length !== segmentIds.length) {
      res.status(400).json({ error: 'One or more segments not found' });
      return;
    }

    const result = await getSegmentOverlap(tenantId, segmentIds);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/customers/:customerId/segments
 * Get all segments a customer belongs to
 */
segmentsRouter.get(
  '/customer/:customerId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.id;
      const { customerId } = req.params;

      // Verify customer belongs to tenant
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const segments = await getCustomerSegments(customerId);

      res.json({ segments });
    } catch (error) {
      next(error);
    }
  }
);
