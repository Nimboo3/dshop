'use client';

import { useState } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, ErrorState, EmptyState } from '@/components/dashboard';
import { useCustomers, type CustomersQueryParams } from '@/hooks/use-api';
import { useShop } from '@/hooks/use-shop';
import {
  formatCurrency,
  formatDate,
  getRfmSegmentName,
  getRfmSegmentColor,
  cn,
} from '@/lib/utils';

const RFM_SEGMENTS = [
  'ALL',
  'CHAMPIONS',
  'LOYAL_CUSTOMERS',
  'POTENTIAL_LOYALISTS',
  'NEW_CUSTOMERS',
  'PROMISING',
  'NEED_ATTENTION',
  'ABOUT_TO_SLEEP',
  'AT_RISK',
  'CANT_LOSE',
  'HIBERNATING',
  'LOST',
];

export default function CustomersPage() {
  const { shop, isLoading: shopLoading } = useShop();
  const [params, setParams] = useState<CustomersQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'totalSpent',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useCustomers(params);

  // Handle search
  const handleSearch = () => {
    setParams(prev => ({ ...prev, search: searchInput, page: 1 }));
  };

  // Handle filter change
  const handleSegmentFilter = (segment: string) => {
    setParams(prev => ({
      ...prev,
      rfmSegment: segment === 'ALL' ? undefined : segment,
      page: 1,
    }));
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    setParams(prev => ({ ...prev, page: newPage }));
  };

  // Handle sort
  const handleSort = (sortBy: string) => {
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
        <PageHeader title="Customers" />
        <ErrorState
          title="No Shop Connected"
          message="Please connect a Shopify store to view customers."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customers" />
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  const customers = data?.customers || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${pagination?.total || 0} customers in your store`}
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch}>Search</Button>
            </div>
            <div className="flex gap-2">
              <Select
                value={params.rfmSegment || 'ALL'}
                onValueChange={handleSegmentFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by segment" />
                </SelectTrigger>
                <SelectContent>
                  {RFM_SEGMENTS.map((segment) => (
                    <SelectItem key={segment} value={segment}>
                      {segment === 'ALL' ? 'All Segments' : getRfmSegmentName(segment)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : customers.length === 0 ? (
            <EmptyState
              title="No customers found"
              description="Try adjusting your search or filters"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('ordersCount')}
                  >
                    Orders {params.sortBy === 'ordersCount' && (params.sortOrder === 'desc' ? '↓' : '↑')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('totalSpent')}
                  >
                    Total Spent {params.sortBy === 'totalSpent' && (params.sortOrder === 'desc' ? '↓' : '↑')}
                  </TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>RFM Segment</TableHead>
                  <TableHead>RFM Scores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Anonymous'}
                        </div>
                        <div className="text-sm text-muted-foreground">{customer.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{customer.ordersCount}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(customer.totalSpent)}
                    </TableCell>
                    <TableCell>
                      {customer.lastOrderDate
                        ? formatDate(customer.lastOrderDate)
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {customer.rfmSegment ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-white border-0',
                            getRfmSegmentColor(customer.rfmSegment)
                          )}
                        >
                          {getRfmSegmentName(customer.rfmSegment)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not calculated</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {customer.recencyScore ? (
                        <div className="flex gap-1 text-xs">
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                            R{customer.recencyScore}
                          </span>
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded">
                            F{customer.frequencyScore}
                          </span>
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">
                            M{customer.monetaryScore}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
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
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} customers
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
