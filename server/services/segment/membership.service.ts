/**
 * Segment Membership Service
 * 
 * Manages segment member records, handles membership computation,
 * and maintains segment statistics.
 */

import { Prisma, RFMSegment } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { SegmentFilters, validateSegmentFilters } from '../../types/segment.types';
import { evaluateSegment, diffEvaluations, EvaluationResult } from './evaluator.service';

const log = logger.child({ module: 'segment-membership' });

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SegmentComputeResult {
  segmentId: string;
  previousCount: number;
  newCount: number;
  added: number;
  removed: number;
  estimatedRevenue: number;
  computedAt: Date;
  duration: number;
}

export interface SegmentWithStats {
  id: string;
  name: string;
  description: string | null;
  filters: SegmentFilters;
  customerCount: number;
  estimatedRevenue: number;
  lastComputedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SegmentMemberWithCustomer {
  id: string;
  addedAt: Date;
  totalSpentSnapshot: number;
  rfmSegmentSnapshot: RFMSegment | null;
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    totalSpent: number;
    ordersCount: number;
    rfmSegment: RFMSegment | null;
  };
}

// ============================================================================
// SEGMENT CRUD OPERATIONS
// ============================================================================

/**
 * Create a new segment
 */
export async function createSegment(
  tenantId: string,
  data: {
    name: string;
    description?: string;
    filters: SegmentFilters;
    isActive?: boolean;
    createdBy?: string;
  }
): Promise<SegmentWithStats> {
  log.info({ tenantId, name: data.name }, 'Creating segment');

  // Validate filters
  const validation = validateSegmentFilters(data.filters);
  if (!validation.success) {
    throw new Error(`Invalid filters: ${validation.error}`);
  }

  const segment = await prisma.segment.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      filters: data.filters as Prisma.JsonObject,
      isActive: data.isActive ?? true,
      createdBy: data.createdBy,
    },
  });

  log.info({ segmentId: segment.id }, 'Segment created');

  return {
    ...segment,
    filters: segment.filters as SegmentFilters,
    estimatedRevenue: Number(segment.estimatedRevenue),
  };
}

/**
 * Update segment definition
 */
export async function updateSegment(
  segmentId: string,
  data: {
    name?: string;
    description?: string | null;
    filters?: SegmentFilters;
    isActive?: boolean;
  }
): Promise<SegmentWithStats> {
  log.info({ segmentId }, 'Updating segment');

  // Validate filters if provided
  if (data.filters) {
    const validation = validateSegmentFilters(data.filters);
    if (!validation.success) {
      throw new Error(`Invalid filters: ${validation.error}`);
    }
  }

  const updateData: Prisma.SegmentUpdateInput = {};
  
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.filters !== undefined) updateData.filters = data.filters as Prisma.JsonObject;

  const segment = await prisma.segment.update({
    where: { id: segmentId },
    data: updateData,
  });

  return {
    ...segment,
    filters: segment.filters as SegmentFilters,
    estimatedRevenue: Number(segment.estimatedRevenue),
  };
}

/**
 * Delete segment and all its members
 */
export async function deleteSegment(segmentId: string): Promise<void> {
  log.info({ segmentId }, 'Deleting segment');

  await prisma.segment.delete({
    where: { id: segmentId },
  });

  log.info({ segmentId }, 'Segment deleted');
}

/**
 * Get segment by ID with stats
 */
export async function getSegment(segmentId: string): Promise<SegmentWithStats | null> {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
  });

  if (!segment) return null;

  return {
    ...segment,
    filters: segment.filters as SegmentFilters,
    estimatedRevenue: Number(segment.estimatedRevenue),
  };
}

/**
 * List segments for a tenant
 */
export async function listSegments(
  tenantId: string,
  options: {
    isActive?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'customerCount' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ segments: SegmentWithStats[]; total: number }> {
  const {
    isActive,
    limit = 50,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  const where: Prisma.SegmentWhereInput = { tenantId };
  if (isActive !== undefined) where.isActive = isActive;

  const [segments, total] = await Promise.all([
    prisma.segment.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    }),
    prisma.segment.count({ where }),
  ]);

  return {
    segments: segments.map((s) => ({
      ...s,
      filters: s.filters as SegmentFilters,
      estimatedRevenue: Number(s.estimatedRevenue),
    })),
    total,
  };
}

// ============================================================================
// MEMBERSHIP COMPUTATION
// ============================================================================

/**
 * Compute segment membership (recompute all members)
 * 
 * This is the main method called by the segment worker.
 * It evaluates the segment filters and updates the membership table.
 */
export async function computeSegmentMembership(
  segmentId: string
): Promise<SegmentComputeResult> {
  const startTime = Date.now();
  log.info({ segmentId }, 'Computing segment membership');

  // Get segment
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    include: {
      members: {
        select: { customerId: true },
      },
    },
  });

  if (!segment) {
    throw new Error(`Segment not found: ${segmentId}`);
  }

  const filters = segment.filters as SegmentFilters;
  const previousCount = segment.customerCount;
  const previousCustomerIds = segment.members.map((m) => m.customerId);

  // Evaluate segment filters
  const evaluation = await evaluateSegment(segment.tenantId, filters);

  // Diff to find changes
  const previousEvaluation: EvaluationResult = {
    customerIds: previousCustomerIds,
    totalCount: previousCount,
    totalSpent: 0,
    evaluatedAt: segment.lastComputedAt ?? new Date(),
  };

  const diff = diffEvaluations(previousEvaluation, evaluation);

  // Update membership in transaction
  await prisma.$transaction(async (tx) => {
    // Remove customers no longer matching
    if (diff.removed.length > 0) {
      await tx.segmentMember.deleteMany({
        where: {
          segmentId,
          customerId: { in: diff.removed },
        },
      });
    }

    // Add new matching customers
    if (diff.added.length > 0) {
      // Get customer data for snapshots
      const newCustomers = await tx.customer.findMany({
        where: { id: { in: diff.added } },
        select: {
          id: true,
          totalSpent: true,
          rfmSegment: true,
        },
      });

      await tx.segmentMember.createMany({
        data: newCustomers.map((c) => ({
          segmentId,
          customerId: c.id,
          totalSpentSnapshot: c.totalSpent,
          rfmSegmentSnapshot: c.rfmSegment,
        })),
        skipDuplicates: true,
      });
    }

    // Update segment stats
    await tx.segment.update({
      where: { id: segmentId },
      data: {
        customerCount: evaluation.totalCount,
        estimatedRevenue: evaluation.totalSpent,
        lastComputedAt: new Date(),
      },
    });
  });

  const duration = Date.now() - startTime;
  const result: SegmentComputeResult = {
    segmentId,
    previousCount,
    newCount: evaluation.totalCount,
    added: diff.added.length,
    removed: diff.removed.length,
    estimatedRevenue: evaluation.totalSpent,
    computedAt: new Date(),
    duration,
  };

  log.info(
    { ...result },
    'Segment membership computed'
  );

  return result;
}

/**
 * Refresh all active segments for a tenant
 * 
 * Called after RFM recalculation to update segment memberships.
 */
export async function refreshAllSegments(
  tenantId: string,
  onProgress?: (completed: number, total: number) => Promise<void>
): Promise<{
  totalSegments: number;
  updated: number;
  errors: number;
  results: SegmentComputeResult[];
}> {
  log.info({ tenantId }, 'Refreshing all segments for tenant');

  const segments = await prisma.segment.findMany({
    where: { tenantId, isActive: true },
    select: { id: true },
  });

  const results: SegmentComputeResult[] = [];
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < segments.length; i++) {
    try {
      const result = await computeSegmentMembership(segments[i].id);
      results.push(result);
      updated++;
    } catch (error) {
      log.error({ segmentId: segments[i].id, error }, 'Failed to refresh segment');
      errors++;
    }

    if (onProgress) {
      await onProgress(i + 1, segments.length);
    }
  }

  log.info(
    { tenantId, totalSegments: segments.length, updated, errors },
    'All segments refreshed'
  );

  return {
    totalSegments: segments.length,
    updated,
    errors,
    results,
  };
}

// ============================================================================
// MEMBERSHIP QUERIES
// ============================================================================

/**
 * Get segment members with customer details
 */
export async function getSegmentMembers(
  segmentId: string,
  options: {
    limit?: number;
    offset?: number;
    sortBy?: 'addedAt' | 'totalSpentSnapshot';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ members: SegmentMemberWithCustomer[]; total: number }> {
  const {
    limit = 50,
    offset = 0,
    sortBy = 'addedAt',
    sortOrder = 'desc',
  } = options;

  const [members, total] = await Promise.all([
    prisma.segmentMember.findMany({
      where: { segmentId },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            totalSpent: true,
            ordersCount: true,
            rfmSegment: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    }),
    prisma.segmentMember.count({ where: { segmentId } }),
  ]);

  return {
    members: members.map((m) => ({
      id: m.id,
      addedAt: m.addedAt,
      totalSpentSnapshot: Number(m.totalSpentSnapshot),
      rfmSegmentSnapshot: m.rfmSegmentSnapshot,
      customer: {
        ...m.customer,
        totalSpent: Number(m.customer.totalSpent),
      },
    })),
    total,
  };
}

/**
 * Check if customer is in a segment
 */
export async function isCustomerInSegment(
  customerId: string,
  segmentId: string
): Promise<boolean> {
  const member = await prisma.segmentMember.findUnique({
    where: {
      segmentId_customerId: { segmentId, customerId },
    },
  });
  return member !== null;
}

/**
 * Get all segments a customer belongs to
 */
export async function getCustomerSegments(
  customerId: string
): Promise<Array<{ id: string; name: string }>> {
  const memberships = await prisma.segmentMember.findMany({
    where: { customerId },
    include: {
      segment: {
        select: { id: true, name: true },
      },
    },
  });

  return memberships.map((m) => m.segment);
}

// ============================================================================
// SEGMENT ANALYTICS
// ============================================================================

/**
 * Get segment overlap analysis (how many customers are in multiple segments)
 */
export async function getSegmentOverlap(
  tenantId: string,
  segmentIds: string[]
): Promise<{
  segments: Array<{ id: string; name: string; count: number }>;
  overlaps: Array<{ segmentPair: [string, string]; count: number }>;
}> {
  if (segmentIds.length < 2) {
    throw new Error('At least 2 segments required for overlap analysis');
  }

  // Get segment info
  const segments = await prisma.segment.findMany({
    where: { id: { in: segmentIds }, tenantId },
    select: { id: true, name: true, customerCount: true },
  });

  // Calculate pairwise overlaps using raw SQL
  const overlaps: Array<{ segmentPair: [string, string]; count: number }> = [];

  for (let i = 0; i < segmentIds.length; i++) {
    for (let j = i + 1; j < segmentIds.length; j++) {
      const count = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM segment_members sm1
        INNER JOIN segment_members sm2 ON sm1.customer_id = sm2.customer_id
        WHERE sm1.segment_id = ${segmentIds[i]}
          AND sm2.segment_id = ${segmentIds[j]}
      `;
      
      overlaps.push({
        segmentPair: [segmentIds[i], segmentIds[j]],
        count: Number(count[0].count),
      });
    }
  }

  return {
    segments: segments.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.customerCount,
    })),
    overlaps,
  };
}
