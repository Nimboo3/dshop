/**
 * Segment Evaluator Service
 * 
 * Converts segment filter DSL to Prisma where clauses and evaluates
 * which customers match a given segment's criteria.
 */

import { Prisma, RFMSegment } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import {
  SegmentFilters,
  FilterGroup,
  FilterCondition,
  FilterableField,
  FilterOperator,
  FieldTypeMap,
  parseRelativeDate,
} from '../../types/segment.types';

const log = logger.child({ module: 'segment-evaluator' });

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type PrismaWhereClause = Prisma.CustomerWhereInput;

export interface EvaluationResult {
  customerIds: string[];
  totalCount: number;
  totalSpent: number;
  evaluatedAt: Date;
}

export interface CustomerPreview {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  totalSpent: number;
  ordersCount: number;
  rfmSegment: RFMSegment | null;
}

// ============================================================================
// FILTER TO PRISMA CONVERSION
// ============================================================================

/**
 * Convert a single filter condition to Prisma where clause
 */
function conditionToPrisma(condition: FilterCondition): PrismaWhereClause {
  const { field, operator, value } = condition;
  const fieldType = FieldTypeMap[field];

  // Handle null checks
  if (operator === 'isNull') {
    return { [field]: null };
  }
  if (operator === 'isNotNull') {
    return { [field]: { not: null } };
  }

  // Process value based on field type
  let processedValue: unknown = value;

  // Date processing
  if (fieldType === 'date' && typeof value === 'string') {
    processedValue = parseRelativeDate(value);
  }

  // Handle array values for dates
  if (fieldType === 'date' && Array.isArray(value)) {
    processedValue = value.map((v) =>
      typeof v === 'string' ? parseRelativeDate(v) : v
    );
  }

  // Convert operator to Prisma
  switch (operator) {
    case 'eq':
      return { [field]: processedValue };
    
    case 'neq':
      return { [field]: { not: processedValue } };
    
    case 'gt':
      return { [field]: { gt: processedValue } };
    
    case 'gte':
      return { [field]: { gte: processedValue } };
    
    case 'lt':
      return { [field]: { lt: processedValue } };
    
    case 'lte':
      return { [field]: { lte: processedValue } };
    
    case 'in':
      return { [field]: { in: processedValue as unknown[] } };
    
    case 'notIn':
      return { [field]: { notIn: processedValue as unknown[] } };
    
    case 'between':
      if (Array.isArray(processedValue) && processedValue.length === 2) {
        return {
          AND: [
            { [field]: { gte: processedValue[0] } },
            { [field]: { lte: processedValue[1] } },
          ],
        };
      }
      throw new Error(`Invalid between value for field ${field}`);
    
    case 'contains':
      return { [field]: { contains: processedValue as string, mode: 'insensitive' } };
    
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

/**
 * Convert a filter group (multiple conditions with AND/OR logic) to Prisma
 */
function filterGroupToPrisma(group: FilterGroup): PrismaWhereClause {
  const conditions = group.conditions.map(conditionToPrisma);
  
  if (group.logic === 'AND') {
    return { AND: conditions };
  } else {
    return { OR: conditions };
  }
}

/**
 * Convert complete segment filters to Prisma where clause
 * 
 * Top-level groups are combined with AND
 */
export function filtersToPrismaWhere(
  tenantId: string,
  filters: SegmentFilters
): PrismaWhereClause {
  const groupClauses = filters.groups.map(filterGroupToPrisma);
  
  return {
    tenantId,
    AND: groupClauses,
  };
}

// ============================================================================
// SEGMENT EVALUATION
// ============================================================================

/**
 * Evaluate segment filters and return matching customer IDs
 */
export async function evaluateSegment(
  tenantId: string,
  filters: SegmentFilters
): Promise<EvaluationResult> {
  log.info({ tenantId }, 'Evaluating segment filters');

  const whereClause = filtersToPrismaWhere(tenantId, filters);

  // Get matching customer IDs and aggregate stats
  const [customers, aggregates] = await Promise.all([
    prisma.customer.findMany({
      where: whereClause,
      select: { id: true },
    }),
    prisma.customer.aggregate({
      where: whereClause,
      _count: { id: true },
      _sum: { totalSpent: true },
    }),
  ]);

  const result: EvaluationResult = {
    customerIds: customers.map((c) => c.id),
    totalCount: aggregates._count.id,
    totalSpent: Number(aggregates._sum.totalSpent ?? 0),
    evaluatedAt: new Date(),
  };

  log.info(
    { tenantId, matchCount: result.totalCount },
    'Segment evaluation complete'
  );

  return result;
}

/**
 * Get count of matching customers (fast check without fetching IDs)
 */
export async function countMatchingCustomers(
  tenantId: string,
  filters: SegmentFilters
): Promise<number> {
  const whereClause = filtersToPrismaWhere(tenantId, filters);
  return prisma.customer.count({ where: whereClause });
}

/**
 * Preview matching customers (limited result for UI preview)
 */
export async function previewSegmentCustomers(
  tenantId: string,
  filters: SegmentFilters,
  limit: number = 10
): Promise<{
  customers: CustomerPreview[];
  totalCount: number;
  estimatedRevenue: number;
}> {
  const whereClause = filtersToPrismaWhere(tenantId, filters);

  const [customers, aggregates] = await Promise.all([
    prisma.customer.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        totalSpent: true,
        ordersCount: true,
        rfmSegment: true,
      },
      orderBy: { totalSpent: 'desc' },
      take: limit,
    }),
    prisma.customer.aggregate({
      where: whereClause,
      _count: { id: true },
      _sum: { totalSpent: true },
    }),
  ]);

  return {
    customers: customers.map((c) => ({
      ...c,
      totalSpent: Number(c.totalSpent),
    })),
    totalCount: aggregates._count.id,
    estimatedRevenue: Number(aggregates._sum.totalSpent ?? 0),
  };
}

// ============================================================================
// FILTER VALIDATION
// ============================================================================

/**
 * Validate that filter can be executed (fields exist, operators valid)
 */
export function validateFiltersExecutable(filters: SegmentFilters): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const validFields = Object.keys(FieldTypeMap);

  for (const group of filters.groups) {
    for (const condition of group.conditions) {
      // Check field exists
      if (!validFields.includes(condition.field)) {
        errors.push(`Unknown field: ${condition.field}`);
        continue;
      }

      const fieldType = FieldTypeMap[condition.field];
      const { operator, value } = condition;

      // Validate operator/value combinations
      if (operator === 'between') {
        if (!Array.isArray(value) || value.length !== 2) {
          errors.push(`Field ${condition.field}: 'between' requires array of 2 values`);
        }
      }

      if (['in', 'notIn'].includes(operator)) {
        if (!Array.isArray(value)) {
          errors.push(`Field ${condition.field}: '${operator}' requires array value`);
        }
      }

      if (operator === 'contains' && fieldType !== 'string') {
        errors.push(`Field ${condition.field}: 'contains' only valid for string fields`);
      }

      if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
        if (fieldType !== 'number' && fieldType !== 'date') {
          errors.push(`Field ${condition.field}: '${operator}' only valid for number/date fields`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// SEGMENT DIFF (for tracking changes)
// ============================================================================

/**
 * Compare two evaluation results to find added/removed customers
 */
export function diffEvaluations(
  previous: EvaluationResult,
  current: EvaluationResult
): {
  added: string[];
  removed: string[];
  unchanged: string[];
} {
  const previousSet = new Set(previous.customerIds);
  const currentSet = new Set(current.customerIds);

  const added = current.customerIds.filter((id) => !previousSet.has(id));
  const removed = previous.customerIds.filter((id) => !currentSet.has(id));
  const unchanged = current.customerIds.filter((id) => previousSet.has(id));

  return { added, removed, unchanged };
}
