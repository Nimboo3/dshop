'use client';

import { useState } from 'react';
import { DollarSign, Users, ShoppingCart, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  KpiCard,
  RevenueChart,
  TopCustomersCard,
  RecentOrdersCard,
  RfmDistributionChart,
  DateRangeFilter,
  PageHeader,
  ErrorState,
} from '@/components/dashboard';
import {
  useOrderStats,
  useDailyOrderStats,
  useTopCustomers,
  useRfmDistribution,
} from '@/hooks/use-api';
import { useShop } from '@/hooks/use-shop';
import { formatCurrency, formatNumber } from '@/lib/utils';

type DateRange = '7d' | '30d' | '90d' | '365d' | 'custom';

export default function DashboardPage() {
  const { shop, isLoading: shopLoading, error: shopError } = useShop();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [dateParams, setDateParams] = useState<{ startDate?: string; endDate?: string }>({});

  // Fetch data
  const {
    data: orderStats,
    isLoading: orderStatsLoading,
    error: orderStatsError,
    refetch: refetchOrderStats,
  } = useOrderStats(dateParams);

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
    error: dailyStatsError,
  } = useDailyOrderStats(dateParams);

  const {
    data: topCustomers,
    isLoading: topCustomersLoading,
  } = useTopCustomers({ limit: 5 });

  const {
    data: rfmDistribution,
    isLoading: rfmLoading,
  } = useRfmDistribution();

  // Handle date range change
  const handleDateRangeChange = (range: DateRange, startDate?: string, endDate?: string) => {
    setDateRange(range);
    setDateParams({ startDate, endDate });
  };

  // Loading state for shop context
  if (shopLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading shop context...</div>
      </div>
    );
  }

  // No shop connected
  if (!shop) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Welcome to Xeno FDE Platform"
        />
        <ErrorState
          title="No Shop Connected"
          message="Please connect a Shopify store to view your dashboard data."
        />
      </div>
    );
  }

  // Error state
  if (orderStatsError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <ErrorState
          message={orderStatsError.message}
          onRetry={() => refetchOrderStats()}
        />
      </div>
    );
  }

  const summary = orderStats?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        description="Your store performance at a glance"
        actions={
          <div className="flex items-center gap-2">
            <DateRangeFilter
              value={dateRange}
              onChange={handleDateRangeChange}
              className="w-[180px]"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchOrderStats()}
              title="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Revenue"
          value={formatCurrency(summary?.totalRevenue || 0)}
          icon={DollarSign}
          isLoading={orderStatsLoading}
        />
        <KpiCard
          title="Total Orders"
          value={formatNumber(summary?.totalOrders || 0)}
          icon={ShoppingCart}
          isLoading={orderStatsLoading}
        />
        <KpiCard
          title="Average Order Value"
          value={formatCurrency(summary?.averageOrderValue || 0)}
          icon={TrendingUp}
          isLoading={orderStatsLoading}
        />
        <KpiCard
          title="Total Customers"
          value={formatNumber(rfmDistribution?.summary?.totalCustomers || 0)}
          icon={Users}
          isLoading={rfmLoading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart
          data={dailyStats?.data || []}
          isLoading={dailyStatsLoading}
          title="Revenue Trend"
          description={`Last ${dateRange === '7d' ? '7 days' : dateRange === '30d' ? '30 days' : dateRange === '90d' ? '90 days' : 'year'}`}
        />
        <RfmDistributionChart
          data={rfmDistribution?.distribution || []}
          isLoading={rfmLoading}
          title="Customer Segments"
          description="RFM-based customer segmentation"
        />
      </div>

      {/* Data Cards Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopCustomersCard
          customers={topCustomers?.customers || []}
          isLoading={topCustomersLoading}
          title="Top Customers"
          limit={5}
        />
        <RecentOrdersCard
          orders={orderStats?.recentOrders || []}
          isLoading={orderStatsLoading}
          title="Recent Orders"
        />
      </div>
    </div>
  );
}
