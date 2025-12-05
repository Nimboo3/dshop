'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatRelativeTime, getRfmSegmentName, getRfmSegmentColor, cn } from '@/lib/utils';
import type { TopCustomer } from '@/hooks/use-api';

interface TopCustomersCardProps {
  customers: TopCustomer[];
  isLoading?: boolean;
  title?: string;
  limit?: number;
}

export function TopCustomersCard({
  customers,
  isLoading,
  title = 'Top Customers',
  limit = 5,
}: TopCustomersCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Segment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.slice(0, limit).map((customer) => (
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
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface RecentOrdersCardProps {
  orders: Array<{
    id: string;
    orderNumber: string;
    totalPrice: number;
    createdAt: string;
    customerName: string;
  }>;
  isLoading?: boolean;
  title?: string;
}

export function RecentOrdersCard({
  orders,
  isLoading,
  title = 'Recent Orders',
}: RecentOrdersCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-20 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">#{order.orderNumber}</div>
                <div className="text-sm text-muted-foreground">
                  {order.customerName} • {formatRelativeTime(order.createdAt)}
                </div>
              </div>
              <div className="font-medium">{formatCurrency(order.totalPrice)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
