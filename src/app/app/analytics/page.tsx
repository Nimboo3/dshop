'use client';

import { useState } from 'react';
import { RefreshCw, Users, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  KpiCard,
  RevenueChart,
  RfmDistributionChart,
  RfmPieChart,
  RfmHeatmap,
  PageHeader,
  ErrorState,
  DateRangeFilter,
} from '@/components/dashboard';
import {
  useRfmDistribution,
  useRfmMatrix,
  useDailyOrderStats,
  useRevenueTrend,
  useRecalculateRfm,
} from '@/hooks/use-api';
import { useShop } from '@/hooks/use-shop';
import { formatCurrency, formatNumber, getRfmSegmentName } from '@/lib/utils';

type DateRange = '7d' | '30d' | '90d' | '365d' | 'custom';

export default function AnalyticsPage() {
  const { shop, isLoading: shopLoading } = useShop();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [dateParams, setDateParams] = useState<{ startDate?: string; endDate?: string }>({});

  // Fetch analytics data
  const {
    data: rfmDistribution,
    isLoading: rfmDistributionLoading,
    error: rfmDistributionError,
    refetch: refetchRfm,
  } = useRfmDistribution();

  const {
    data: rfmMatrix,
    isLoading: rfmMatrixLoading,
  } = useRfmMatrix();

  const {
    data: dailyStats,
    isLoading: dailyStatsLoading,
  } = useDailyOrderStats(dateParams);

  const {
    data: revenueTrend,
    isLoading: revenueTrendLoading,
  } = useRevenueTrend(dateParams);

  const recalculateRfm = useRecalculateRfm();

  // Handle date range change
  const handleDateRangeChange = (range: DateRange, startDate?: string, endDate?: string) => {
    setDateRange(range);
    setDateParams({ startDate, endDate });
  };

  // Handle RFM recalculation
  const handleRecalculateRfm = () => {
    recalculateRfm.mutate();
  };

  if (shopLoading) {
    return <div className="animate-pulse text-muted-foreground p-4">Loading...</div>;
  }

  if (!shop) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" />
        <ErrorState
          title="No Shop Connected"
          message="Please connect a Shopify store to view analytics."
        />
      </div>
    );
  }

  if (rfmDistributionError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" />
        <ErrorState message={rfmDistributionError.message} onRetry={() => refetchRfm()} />
      </div>
    );
  }

  const summary = rfmDistribution?.summary;
  const distribution = rfmDistribution?.distribution || [];

  // Find key segments
  const championsCount = distribution.find(d => d.segment === 'CHAMPIONS')?.count || 0;
  const atRiskCount = distribution.find(d => d.segment === 'AT_RISK')?.count || 0;
  const loyalCount = distribution.find(d => d.segment === 'LOYAL_CUSTOMERS')?.count || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Customer insights and RFM analysis"
        actions={
          <div className="flex items-center gap-2">
            <DateRangeFilter
              value={dateRange}
              onChange={handleDateRangeChange}
              className="w-[180px]"
            />
            <Button
              variant="outline"
              onClick={handleRecalculateRfm}
              disabled={recalculateRfm.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${recalculateRfm.isPending ? 'animate-spin' : ''}`} />
              Recalculate RFM
            </Button>
          </div>
        }
      />

      {/* Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Customers"
          value={formatNumber(summary?.totalCustomers || 0)}
          icon={Users}
          isLoading={rfmDistributionLoading}
        />
        <KpiCard
          title="Champions"
          value={formatNumber(championsCount)}
          subtitle={`${summary?.totalCustomers ? ((championsCount / summary.totalCustomers) * 100).toFixed(1) : 0}% of customers`}
          icon={TrendingUp}
          isLoading={rfmDistributionLoading}
        />
        <KpiCard
          title="Loyal Customers"
          value={formatNumber(loyalCount)}
          subtitle={`${summary?.totalCustomers ? ((loyalCount / summary.totalCustomers) * 100).toFixed(1) : 0}% of customers`}
          icon={Users}
          isLoading={rfmDistributionLoading}
        />
        <KpiCard
          title="At Risk"
          value={formatNumber(atRiskCount)}
          subtitle={`${summary?.totalCustomers ? ((atRiskCount / summary.totalCustomers) * 100).toFixed(1) : 0}% need attention`}
          icon={Users}
          isLoading={rfmDistributionLoading}
        />
      </div>

      {/* Tabs for different analytics views */}
      <Tabs defaultValue="rfm" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rfm">RFM Analysis</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="cohorts">Segments</TabsTrigger>
        </TabsList>

        {/* RFM Analysis Tab */}
        <TabsContent value="rfm" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <RfmDistributionChart
              data={distribution}
              isLoading={rfmDistributionLoading}
              title="Customer Segment Distribution"
              description="Number of customers in each RFM segment"
            />
            <RfmHeatmap
              matrix={rfmMatrix?.matrix || []}
              isLoading={rfmMatrixLoading}
              title="RFM Score Heatmap"
            />
          </div>

          {/* Segment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Segment Breakdown</CardTitle>
              <CardDescription>
                Detailed metrics for each customer segment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {distribution.slice(0, 6).map((segment) => (
                  <div
                    key={segment.segment}
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{getRfmSegmentName(segment.segment)}</span>
                      <span className="text-sm text-muted-foreground">
                        {segment.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-muted-foreground">Customers</div>
                        <div className="font-medium">{formatNumber(segment.count)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total Spent</div>
                        <div className="font-medium">{formatCurrency(segment.totalSpent)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-muted-foreground">Avg. Spend</div>
                        <div className="font-medium">{formatCurrency(segment.avgSpent)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-6">
          <div className="grid gap-6">
            <RevenueChart
              data={dailyStats?.data || []}
              isLoading={dailyStatsLoading}
              title="Revenue Over Time"
              description={`Revenue trend for the selected period`}
            />
          </div>

          {/* Revenue by segment */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Segment</CardTitle>
              <CardDescription>
                How much each customer segment contributes to revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <RfmPieChart
                  data={distribution}
                  isLoading={rfmDistributionLoading}
                  title=""
                  valueKey="totalSpent"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Segments/Cohorts Tab */}
        <TabsContent value="cohorts" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <RfmPieChart
              data={distribution}
              isLoading={rfmDistributionLoading}
              title="Customer Distribution"
              valueKey="count"
            />
            <RfmPieChart
              data={distribution}
              isLoading={rfmDistributionLoading}
              title="Revenue Distribution"
              valueKey="totalSpent"
            />
          </div>

          {/* Actionable insights */}
          <Card>
            <CardHeader>
              <CardTitle>Actionable Insights</CardTitle>
              <CardDescription>
                Recommendations based on your customer segments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {championsCount > 0 && (
                  <div className="p-4 rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
                    <div className="font-medium text-emerald-800 dark:text-emerald-200">
                      Champions ({formatNumber(championsCount)})
                    </div>
                    <div className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                      These are your best customers. Consider creating a VIP loyalty program or early access to new products.
                    </div>
                  </div>
                )}
                {atRiskCount > 0 && (
                  <div className="p-4 rounded-lg border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
                    <div className="font-medium text-red-800 dark:text-red-200">
                      At Risk ({formatNumber(atRiskCount)})
                    </div>
                    <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                      These customers haven&apos;t purchased recently. Send them a win-back email with special offers.
                    </div>
                  </div>
                )}
                {loyalCount > 0 && (
                  <div className="p-4 rounded-lg border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20">
                    <div className="font-medium text-blue-800 dark:text-blue-200">
                      Loyal Customers ({formatNumber(loyalCount)})
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Reward their loyalty with exclusive discounts or ask for referrals to grow your customer base.
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
