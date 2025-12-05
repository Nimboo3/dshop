'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Users, MoreVertical, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader, ErrorState, EmptyState } from '@/components/dashboard';
import { useSegments, useDeleteSegment } from '@/hooks/use-api';
import { useShop } from '@/hooks/use-shop';
import { formatNumber, formatDate } from '@/lib/utils';

export default function SegmentsPage() {
  const { shop, isLoading: shopLoading } = useShop();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useSegments();

  const deleteSegment = useDeleteSegment();

  const handleDelete = async (segmentId: string) => {
    if (confirm('Are you sure you want to delete this segment?')) {
      await deleteSegment.mutateAsync(segmentId);
    }
  };

  if (shopLoading) {
    return <div className="animate-pulse text-muted-foreground p-4">Loading...</div>;
  }

  if (!shop) {
    return (
      <div className="space-y-6">
        <PageHeader title="Segments" />
        <ErrorState
          title="No Shop Connected"
          message="Please connect a Shopify store to view segments."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Segments" />
        <ErrorState message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  const segments = data?.segments || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Segments"
        description="Create and manage customer segments for targeted marketing"
        actions={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Segment
          </Button>
        }
      />

      {/* Segments Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Segments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(segments.length)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Segments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(segments.filter(s => s.isActive).length)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Customers in Segments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(segments.reduce((sum, s) => sum + s.memberCount, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segments Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Segments</CardTitle>
          <CardDescription>
            Manage your customer segments and their filter criteria
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : segments.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="No segments yet"
              description="Create your first customer segment to start targeting specific groups"
              action={{
                label: 'Create Segment',
                onClick: () => {/* TODO: Open create modal */},
              }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((segment) => (
                  <TableRow key={segment.id}>
                    <TableCell className="font-medium">{segment.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {segment.description || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {formatNumber(segment.memberCount)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={segment.isActive ? 'success' : 'secondary'}>
                        {segment.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(segment.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View members</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit segment</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(segment.id)}
                              disabled={deleteSegment.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete segment</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Quick Create Section */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Segment Templates</CardTitle>
          <CardDescription>
            Start with a pre-built segment template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <button
              className="p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Create from template */}}
            >
              <div className="font-medium">High Value Customers</div>
              <div className="text-sm text-muted-foreground mt-1">
                Customers who spent more than $500 total
              </div>
            </button>
            <button
              className="p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Create from template */}}
            >
              <div className="font-medium">Recent Purchasers</div>
              <div className="text-sm text-muted-foreground mt-1">
                Customers who ordered in the last 30 days
              </div>
            </button>
            <button
              className="p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Create from template */}}
            >
              <div className="font-medium">At Risk Customers</div>
              <div className="text-sm text-muted-foreground mt-1">
                Customers who haven&apos;t ordered in 90+ days
              </div>
            </button>
            <button
              className="p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Create from template */}}
            >
              <div className="font-medium">Repeat Buyers</div>
              <div className="text-sm text-muted-foreground mt-1">
                Customers with 3+ orders
              </div>
            </button>
            <button
              className="p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Create from template */}}
            >
              <div className="font-medium">Champions (RFM)</div>
              <div className="text-sm text-muted-foreground mt-1">
                Best customers by RFM analysis
              </div>
            </button>
            <button
              className="p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Create from template */}}
            >
              <div className="font-medium">New Customers</div>
              <div className="text-sm text-muted-foreground mt-1">
                First-time buyers in last 30 days
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
