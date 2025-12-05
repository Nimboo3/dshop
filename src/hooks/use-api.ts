'use client';

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { useShop } from './use-shop';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ============================================================================
// TYPES
// ============================================================================

// Analytics Types
export interface RfmDistribution {
  segment: string;
  count: number;
  totalSpent: number;
  avgSpent: number;
  percentage: number;
}

export interface RfmDistributionResponse {
  distribution: RfmDistribution[];
  summary: {
    totalCustomers: number;
    totalRevenue: number;
    segmentsWithCustomers: number;
  };
}

export interface RfmMatrixCell {
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  count: number;
  avgSpent: number;
}

export interface RfmMatrixResponse {
  matrix: RfmMatrixCell[];
  summary: {
    totalCustomers: number;
    avgRecency: number;
    avgFrequency: number;
    avgMonetary: number;
  };
}

// Customer Types
export interface Customer {
  id: string;
  shopifyId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  totalSpent: number;
  ordersCount: number;
  lastOrderDate: string | null;
  rfmSegment: string | null;
  recencyScore: number | null;
  frequencyScore: number | null;
  monetaryScore: number | null;
  createdAt: string;
}

export interface CustomersResponse {
  customers: Customer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Order Types
export interface Order {
  id: string;
  shopifyId: string;
  orderNumber: string;
  orderName: string;
  totalPrice: number;
  subtotalPrice: number;
  totalTax: number | null;
  totalDiscounts: number | null;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  orderDate: string;
  createdAt: string;
  customer: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface OrderStatsResponse {
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
  };
  byStatus: Array<{
    status: string;
    count: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    totalPrice: number;
    createdAt: string;
    customerName: string;
  }>;
}

export interface DailyOrderStats {
  date: string;
  orders: number;
  revenue: number;
}

export interface DailyOrderStatsResponse {
  startDate: string;
  endDate: string;
  data: DailyOrderStats[];
}

// Segment Types
export interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: unknown;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentsResponse {
  segments: Segment[];
  total: number;
}

// Revenue Types
export interface RevenueTrendData {
  date: string;
  revenue: number;
  orders: number;
}

export interface RevenueTrendResponse {
  data: RevenueTrendData[];
  summary: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    periodStart: string;
    periodEnd: string;
  };
}

// Top Customers Types
export interface TopCustomer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  totalSpent: number;
  ordersCount: number;
  lastOrderDate: string | null;
  rfmSegment: string | null;
}

export interface TopCustomersResponse {
  customers: TopCustomer[];
}

// ============================================================================
// FETCH HELPER
// ============================================================================

async function fetchApi<T>(
  endpoint: string,
  shop: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (shop) {
    headers['X-Shopify-Shop-Domain'] = shop;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// ANALYTICS HOOKS
// ============================================================================

export function useRfmDistribution(options?: UseQueryOptions<RfmDistributionResponse>) {
  const { shop } = useShop();

  return useQuery({
    queryKey: ['rfm', 'distribution', shop],
    queryFn: () => fetchApi<RfmDistributionResponse>('/api/analytics/rfm/distribution', shop),
    enabled: !!shop,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

export function useRfmMatrix(options?: UseQueryOptions<RfmMatrixResponse>) {
  const { shop } = useShop();

  return useQuery({
    queryKey: ['rfm', 'matrix', shop],
    queryFn: () => fetchApi<RfmMatrixResponse>('/api/analytics/rfm/matrix', shop),
    enabled: !!shop,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useRevenueTrend(
  params?: { startDate?: string; endDate?: string; granularity?: 'day' | 'week' | 'month' },
  options?: UseQueryOptions<RevenueTrendResponse>
) {
  const { shop } = useShop();
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.set('startDate', params.startDate);
  if (params?.endDate) queryParams.set('endDate', params.endDate);
  if (params?.granularity) queryParams.set('granularity', params.granularity);

  return useQuery({
    queryKey: ['analytics', 'revenue', shop, params],
    queryFn: () => fetchApi<RevenueTrendResponse>(`/api/analytics/revenue/trend?${queryParams}`, shop),
    enabled: !!shop,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useTopCustomers(
  params?: { limit?: number; sortBy?: string },
  options?: UseQueryOptions<TopCustomersResponse>
) {
  const { shop } = useShop();
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.sortBy) queryParams.set('sortBy', params.sortBy);

  return useQuery({
    queryKey: ['analytics', 'customers', 'top', shop, params],
    queryFn: () => fetchApi<TopCustomersResponse>(`/api/analytics/customers/top?${queryParams}`, shop),
    enabled: !!shop,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================================================
// ORDER HOOKS
// ============================================================================

export interface OrdersQueryParams {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalPrice' | 'orderNumber';
  sortOrder?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
  status?: 'pending' | 'paid' | 'refunded' | 'cancelled' | 'any';
  minAmount?: number;
  maxAmount?: number;
  customerId?: string;
  search?: string;
}

export function useOrders(params?: OrdersQueryParams, options?: UseQueryOptions<OrdersResponse>) {
  const { shop } = useShop();
  const queryParams = new URLSearchParams();
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });
  }

  return useQuery({
    queryKey: ['orders', shop, params],
    queryFn: () => fetchApi<OrdersResponse>(`/api/orders?${queryParams}`, shop),
    enabled: !!shop,
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

export function useOrder(orderId: string, options?: UseQueryOptions<Order>) {
  const { shop } = useShop();

  return useQuery({
    queryKey: ['orders', orderId, shop],
    queryFn: () => fetchApi<Order>(`/api/orders/${orderId}`, shop),
    enabled: !!shop && !!orderId,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useOrderStats(
  params?: { startDate?: string; endDate?: string },
  options?: UseQueryOptions<OrderStatsResponse>
) {
  const { shop } = useShop();
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.set('startDate', params.startDate);
  if (params?.endDate) queryParams.set('endDate', params.endDate);

  return useQuery({
    queryKey: ['orders', 'stats', shop, params],
    queryFn: () => fetchApi<OrderStatsResponse>(`/api/orders/stats/summary?${queryParams}`, shop),
    enabled: !!shop,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useDailyOrderStats(
  params?: { startDate?: string; endDate?: string },
  options?: UseQueryOptions<DailyOrderStatsResponse>
) {
  const { shop } = useShop();
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.set('startDate', params.startDate);
  if (params?.endDate) queryParams.set('endDate', params.endDate);

  return useQuery({
    queryKey: ['orders', 'daily', shop, params],
    queryFn: () => fetchApi<DailyOrderStatsResponse>(`/api/orders/stats/daily?${queryParams}`, shop),
    enabled: !!shop,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================================================
// CUSTOMER HOOKS
// ============================================================================

export interface CustomersQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  rfmSegment?: string;
}

export function useCustomers(params?: CustomersQueryParams, options?: UseQueryOptions<CustomersResponse>) {
  const { shop } = useShop();
  const queryParams = new URLSearchParams();
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, value.toString());
      }
    });
  }

  return useQuery({
    queryKey: ['customers', shop, params],
    queryFn: () => fetchApi<CustomersResponse>(`/api/customers?${queryParams}`, shop),
    enabled: !!shop,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useCustomer(customerId: string, options?: UseQueryOptions<Customer>) {
  const { shop } = useShop();

  return useQuery({
    queryKey: ['customers', customerId, shop],
    queryFn: () => fetchApi<Customer>(`/api/customers/${customerId}`, shop),
    enabled: !!shop && !!customerId,
    staleTime: 60 * 1000,
    ...options,
  });
}

// ============================================================================
// SEGMENT HOOKS
// ============================================================================

export function useSegments(options?: UseQueryOptions<SegmentsResponse>) {
  const { shop } = useShop();

  return useQuery({
    queryKey: ['segments', shop],
    queryFn: () => fetchApi<SegmentsResponse>('/api/segments', shop),
    enabled: !!shop,
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useSegment(segmentId: string, options?: UseQueryOptions<Segment>) {
  const { shop } = useShop();

  return useQuery({
    queryKey: ['segments', segmentId, shop],
    queryFn: () => fetchApi<Segment>(`/api/segments/${segmentId}`, shop),
    enabled: !!shop && !!segmentId,
    staleTime: 60 * 1000,
    ...options,
  });
}

interface CreateSegmentInput {
  name: string;
  description?: string;
  filters: unknown;
  isActive?: boolean;
}

export function useCreateSegment() {
  const { shop } = useShop();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSegmentInput) =>
      fetchApi<Segment>('/api/segments', shop, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments', shop] });
    },
  });
}

export function useUpdateSegment() {
  const { shop } = useShop();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<CreateSegmentInput>) =>
      fetchApi<Segment>(`/api/segments/${id}`, shop, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['segments', shop] });
      queryClient.invalidateQueries({ queryKey: ['segments', variables.id, shop] });
    },
  });
}

export function useDeleteSegment() {
  const { shop } = useShop();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (segmentId: string) =>
      fetchApi<void>(`/api/segments/${segmentId}`, shop, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments', shop] });
    },
  });
}

export function usePreviewSegment() {
  const { shop } = useShop();

  return useMutation({
    mutationFn: (filters: unknown) =>
      fetchApi<{ count: number; sample: Customer[] }>('/api/segments/preview', shop, {
        method: 'POST',
        body: JSON.stringify({ filters }),
      }),
  });
}

// ============================================================================
// RFM ACTIONS
// ============================================================================

export function useRecalculateRfm() {
  const { shop } = useShop();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<{ jobId: string }>('/api/analytics/rfm/recalculate', shop, {
        method: 'POST',
      }),
    onSuccess: () => {
      // Invalidate RFM-related queries after recalculation is triggered
      queryClient.invalidateQueries({ queryKey: ['rfm', shop] });
      queryClient.invalidateQueries({ queryKey: ['customers', shop] });
    },
  });
}
