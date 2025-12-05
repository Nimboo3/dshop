/**
 * Segment Filter DSL Types and Zod Schemas
 * 
 * Defines the structure for segment filter definitions stored as JSON.
 * Supports flexible querying on customer fields with various operators.
 */

import { z } from 'zod';
import { RFMSegment } from '@prisma/client';

// ============================================================================
// FILTER OPERATORS
// ============================================================================

export const FilterOperator = z.enum([
  'eq',       // Equals
  'neq',      // Not equals
  'gt',       // Greater than
  'gte',      // Greater than or equal
  'lt',       // Less than
  'lte',      // Less than or equal
  'in',       // In array
  'notIn',    // Not in array
  'between',  // Between two values (inclusive)
  'contains', // String contains (case-insensitive)
  'isNull',   // Is null
  'isNotNull', // Is not null
]);

export type FilterOperator = z.infer<typeof FilterOperator>;

// ============================================================================
// FILTERABLE FIELDS
// ============================================================================

/**
 * Customer fields that can be filtered on
 */
export const FilterableField = z.enum([
  // Identity
  'email',
  'firstName',
  'lastName',
  'phone',
  
  // Metrics
  'totalSpent',
  'ordersCount',
  'avgOrderValue',
  'daysSinceLastOrder',
  
  // Dates
  'lastOrderDate',
  'firstOrderDate',
  'shopifyCreatedAt',
  'createdAt',
  
  // RFM
  'recencyScore',
  'frequencyScore',
  'monetaryScore',
  'rfmSegment',
  
  // Flags
  'isHighValue',
  'isChurnRisk',
  'hasAbandonedCart',
]);

export type FilterableField = z.infer<typeof FilterableField>;

// ============================================================================
// FIELD TYPE MAPPINGS
// ============================================================================

/**
 * Maps fields to their data types for validation
 */
export const FieldTypeMap: Record<FilterableField, 'string' | 'number' | 'date' | 'boolean' | 'enum'> = {
  // String fields
  email: 'string',
  firstName: 'string',
  lastName: 'string',
  phone: 'string',
  
  // Number fields
  totalSpent: 'number',
  ordersCount: 'number',
  avgOrderValue: 'number',
  daysSinceLastOrder: 'number',
  recencyScore: 'number',
  frequencyScore: 'number',
  monetaryScore: 'number',
  
  // Date fields
  lastOrderDate: 'date',
  firstOrderDate: 'date',
  shopifyCreatedAt: 'date',
  createdAt: 'date',
  
  // Boolean fields
  isHighValue: 'boolean',
  isChurnRisk: 'boolean',
  hasAbandonedCart: 'boolean',
  
  // Enum fields
  rfmSegment: 'enum',
};

// ============================================================================
// RFM SEGMENT ENUM FOR FILTERS
// ============================================================================

export const RfmSegmentValue = z.enum([
  'CHAMPIONS',
  'LOYAL',
  'POTENTIAL_LOYALIST',
  'NEW_CUSTOMERS',
  'PROMISING',
  'NEED_ATTENTION',
  'ABOUT_TO_SLEEP',
  'AT_RISK',
  'CANNOT_LOSE',
  'HIBERNATING',
  'LOST',
]);

// ============================================================================
// FILTER VALUE SCHEMAS
// ============================================================================

// String value
const StringFilterValue = z.string().min(1).max(500);

// Number value
const NumberFilterValue = z.number();

// Date value (ISO string or relative like "-30d")
const DateFilterValue = z.union([
  z.string().datetime(), // ISO date string
  z.string().regex(/^-?\d+[dhm]$/, 'Relative date format: -30d, -7d, etc.'), // Relative: -30d, -7d
]);

// Boolean value
const BooleanFilterValue = z.boolean();

// Range value for "between" operator
const RangeValue = z.tuple([z.number(), z.number()]);
const DateRangeValue = z.tuple([DateFilterValue, DateFilterValue]);

// Array value for "in" / "notIn" operators
const StringArrayValue = z.array(StringFilterValue).min(1).max(100);
const NumberArrayValue = z.array(NumberFilterValue).min(1).max(100);
const RfmSegmentArrayValue = z.array(RfmSegmentValue).min(1);

// ============================================================================
// SINGLE FILTER CONDITION SCHEMA
// ============================================================================

/**
 * A single filter condition
 */
export const FilterCondition = z.object({
  field: FilterableField,
  operator: FilterOperator,
  value: z.union([
    StringFilterValue,
    NumberFilterValue,
    DateFilterValue,
    BooleanFilterValue,
    RangeValue,
    DateRangeValue,
    StringArrayValue,
    NumberArrayValue,
    RfmSegmentArrayValue,
    z.null(), // For isNull/isNotNull
  ]).optional(),
}).refine((data) => {
  // Validate that isNull/isNotNull don't require a value
  if (data.operator === 'isNull' || data.operator === 'isNotNull') {
    return true; // Value is optional for these operators
  }
  // All other operators require a value
  return data.value !== undefined && data.value !== null;
}, {
  message: 'Value is required for this operator',
});

export type FilterCondition = z.infer<typeof FilterCondition>;

// ============================================================================
// FILTER GROUP (AND/OR logic)
// ============================================================================

export const FilterLogic = z.enum(['AND', 'OR']);
export type FilterLogic = z.infer<typeof FilterLogic>;

/**
 * A group of filter conditions combined with AND/OR logic
 */
export const FilterGroup = z.object({
  logic: FilterLogic,
  conditions: z.array(FilterCondition).min(1).max(20),
});

export type FilterGroup = z.infer<typeof FilterGroup>;

// ============================================================================
// COMPLETE SEGMENT FILTER SCHEMA
// ============================================================================

/**
 * Complete segment filter definition
 * 
 * Structure:
 * - Top-level groups combined with AND
 * - Each group has conditions combined with its own logic (AND/OR)
 * 
 * Example:
 * {
 *   groups: [
 *     { logic: 'AND', conditions: [{ field: 'totalSpent', operator: 'gt', value: 100 }] },
 *     { logic: 'OR', conditions: [
 *       { field: 'rfmSegment', operator: 'in', value: ['CHAMPIONS', 'LOYAL'] },
 *       { field: 'isHighValue', operator: 'eq', value: true }
 *     ]}
 *   ]
 * }
 * 
 * SQL: (totalSpent > 100) AND (rfmSegment IN ('CHAMPIONS','LOYAL') OR isHighValue = true)
 */
export const SegmentFilters = z.object({
  groups: z.array(FilterGroup).min(1).max(10),
});

export type SegmentFilters = z.infer<typeof SegmentFilters>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate segment filters against Zod schema
 */
export function validateSegmentFilters(filters: unknown): {
  success: boolean;
  data?: SegmentFilters;
  error?: string;
} {
  const result = SegmentFilters.safeParse(filters);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  // Format error message
  const errorMessages = result.error.errors.map(
    (e) => `${e.path.join('.')}: ${e.message}`
  );
  
  return {
    success: false,
    error: errorMessages.join('; '),
  };
}

/**
 * Validate operator is appropriate for field type
 */
export function validateOperatorForField(
  field: FilterableField,
  operator: FilterOperator
): boolean {
  const fieldType = FieldTypeMap[field];
  
  // Operators valid for all types
  const universalOps: FilterOperator[] = ['eq', 'neq', 'in', 'notIn', 'isNull', 'isNotNull'];
  if (universalOps.includes(operator)) {
    return true;
  }
  
  // Type-specific operators
  switch (fieldType) {
    case 'number':
    case 'date':
      return ['gt', 'gte', 'lt', 'lte', 'between'].includes(operator);
    case 'string':
      return ['contains'].includes(operator);
    case 'boolean':
      return false; // Only eq/neq for booleans
    case 'enum':
      return false; // Only eq/neq/in/notIn for enums
    default:
      return false;
  }
}

/**
 * Parse relative date string to absolute date
 * e.g., "-30d" -> Date 30 days ago
 */
export function parseRelativeDate(value: string): Date {
  const match = value.match(/^(-?\d+)([dhm])$/);
  if (!match) {
    return new Date(value); // Assume ISO string
  }
  
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();
  
  switch (unit) {
    case 'd':
      now.setDate(now.getDate() + amount);
      break;
    case 'h':
      now.setHours(now.getHours() + amount);
      break;
    case 'm':
      now.setMonth(now.getMonth() + amount);
      break;
  }
  
  return now;
}

// ============================================================================
// API REQUEST/RESPONSE SCHEMAS
// ============================================================================

/**
 * Create segment request
 */
export const CreateSegmentRequest = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  filters: SegmentFilters,
  isActive: z.boolean().default(true),
});

export type CreateSegmentRequest = z.infer<typeof CreateSegmentRequest>;

/**
 * Update segment request
 */
export const UpdateSegmentRequest = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  filters: SegmentFilters.optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSegmentRequest = z.infer<typeof UpdateSegmentRequest>;

/**
 * Preview segment request (dry-run filter evaluation)
 */
export const PreviewSegmentRequest = z.object({
  filters: SegmentFilters,
  limit: z.number().int().min(1).max(100).default(10),
});

export type PreviewSegmentRequest = z.infer<typeof PreviewSegmentRequest>;
