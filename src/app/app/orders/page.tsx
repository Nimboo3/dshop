'use client';

import { useState } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, ErrorState, EmptyState, DateRangeFilter } from '@/components/dashboard';
import { useOrders, type OrdersQueryParams } from '@/hooks/use-api';
import { useShop } from '@/hooks/use-shop';
import { formatCurrency, formatDate, formatDateTime, cn } from '@/lib/utils';

type DateRange = '7d' | '30d' | '90d' | '365d' | 'custom';

const STATUS_OPTIONS = [
  { value: 'any', label: 'All Statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getStatusBadgeVariant(status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'refunded':
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export default function OrdersPage() {
  const { shop, isLoading: shopLoading } = useShop();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [params, setParams] = useState<OrdersQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useOrders(params);

  // Handle search
  const handleSearch = () => {
    setParams(prev => ({ ...prev, search: searchInput, page: 1 }));
  };

  // Handle status filter
  const handleStatusFilter = (status: string) => {
    setParams(prev => ({
      ...prev,
      status: status as OrdersQueryParams['status'],
      page: 1,
    }));
  };

  // Handle date range change
  const handleDateRangeChange = (range: DateRange, startDate?: string, endDate?: string) => {
    setDateRange(range);
    setParams(prev => ({ ...prev, startDate, endDate, page: 1 }));
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    setParams(prev => ({ ...prev, page: newPage }));
  };

  // Handle sort
  const handleSort = (sortBy: 'createdAt' | 'totalPrice' | 'orderNumber') => {
    setParams(prev => ({
      ...prev,
      sortBy,
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }));
  };

  if (shopLoading) {
    return <div className="animate-pulse text-muted-foreground p-4">Loading...</div>;
  }

  if (!shop) {
    return (
      <div className="space-y-6">
        <PageHeader title="Orders" />
        <ErrorState
          title="No Shop Connected"
          message="Please connect a Shopify store to view orders."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Orders" />
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  const orders = data?.orders || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${pagination?.total || 0} orders in your store`}
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order # or email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch}>Search</Button>
            </div>
            <div className="flex gap-2">
              <DateRangeFilter
                value={dateRange}
                onChange={handleDateRangeChange}
                className="w-[160px]"
              />
              <Select
                value={params.status || 'any'}
                onValueChange={handleStatusFilter}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              title="No orders found"
              description="Try adjusting your search or filters"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('orderNumber')}
                  >
                    Order {params.sortBy === 'orderNumber' && (params.sortOrder === 'desc' ? '↓' : '↑')}
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('createdAt')}
                  >
                    Date {params.sortBy === 'createdAt' && (params.sortOrder === 'desc' ? '↓' : '↑')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('totalPrice')}
                  >
                    Total {params.sortBy === 'totalPrice' && (params.sortOrder === 'desc' ? '↓' : '↑')}
                  </TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Fulfillment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.orderName || `#${order.orderNumber}`}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {order.customer?.name || 'Guest'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {order.customer?.email || '-'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{formatDate(order.orderDate)}</div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(order.orderDate).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(order.totalPrice, order.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(order.financialStatus)}>
                        {order.financialStatus || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {order.fulfillmentStatus || 'Unfulfilled'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNextPage}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
