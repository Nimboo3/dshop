'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, getRfmSegmentName, getRfmSegmentColor, formatCurrency } from '@/lib/utils';
import type { RfmDistribution } from '@/hooks/use-api';

// Segment colors mapping
const SEGMENT_COLORS: Record<string, string> = {
  CHAMPIONS: '#10b981',
  LOYAL_CUSTOMERS: '#3b82f6',
  POTENTIAL_LOYALISTS: '#8b5cf6',
  NEW_CUSTOMERS: '#06b6d4',
  PROMISING: '#14b8a6',
  NEED_ATTENTION: '#f59e0b',
  ABOUT_TO_SLEEP: '#ef4444',
  AT_RISK: '#dc2626',
  CANT_LOSE: '#f97316',
  HIBERNATING: '#6b7280',
  LOST: '#374151',
};

interface RfmDistributionChartProps {
  data: RfmDistribution[];
  isLoading?: boolean;
  title?: string;
  description?: string;
}

export function RfmDistributionChart({
  data,
  isLoading,
  title = 'RFM Segment Distribution',
  description,
}: RfmDistributionChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    ...item,
    name: getRfmSegmentName(item.segment),
    color: SEGMENT_COLORS[item.segment] || '#6b7280',
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Customers: {formatNumber(data.count)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Total Spent: {formatCurrency(data.totalSpent)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {data.percentage.toFixed(1)}% of customers
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface RfmPieChartProps {
  data: RfmDistribution[];
  isLoading?: boolean;
  title?: string;
  valueKey?: 'count' | 'totalSpent';
}

export function RfmPieChart({
  data,
  isLoading,
  title = 'Customer Segments',
  valueKey = 'count',
}: RfmPieChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full rounded-full mx-auto max-w-[250px]" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    name: getRfmSegmentName(item.segment),
    value: item[valueKey],
    color: SEGMENT_COLORS[item.segment] || '#6b7280',
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) =>
                  percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''
                }
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) =>
                  valueKey === 'totalSpent' ? formatCurrency(value) : formatNumber(value)
                }
              />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface RfmHeatmapProps {
  matrix: Array<{
    recencyScore: number;
    frequencyScore: number;
    monetaryScore: number;
    count: number;
    avgSpent: number;
  }>;
  isLoading?: boolean;
  title?: string;
}

export function RfmHeatmap({ matrix, isLoading, title = 'RFM Score Heatmap' }: RfmHeatmapProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Create 5x5 grid for R x F (aggregated across M)
  const heatmapData: number[][] = Array(5)
    .fill(null)
    .map(() => Array(5).fill(0));

  matrix.forEach(cell => {
    const r = cell.recencyScore - 1;
    const f = cell.frequencyScore - 1;
    if (r >= 0 && r < 5 && f >= 0 && f < 5) {
      heatmapData[4 - r][f] += cell.count; // Invert R so high recency is at top
    }
  });

  const maxCount = Math.max(...heatmapData.flat());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Recency (rows) vs Frequency (columns) - darker = more customers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs text-muted-foreground w-8"></span>
            {[1, 2, 3, 4, 5].map(f => (
              <span key={f} className="text-xs text-muted-foreground w-12 text-center">
                F{f}
              </span>
            ))}
          </div>
          {heatmapData.map((row, rIdx) => (
            <div key={rIdx} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground w-8">R{5 - rIdx}</span>
              {row.map((count, fIdx) => {
                const intensity = maxCount > 0 ? count / maxCount : 0;
                return (
                  <div
                    key={fIdx}
                    className="w-12 h-10 rounded flex items-center justify-center text-xs font-medium"
                    style={{
                      backgroundColor: `rgba(0, 128, 96, ${0.1 + intensity * 0.8})`,
                      color: intensity > 0.5 ? 'white' : 'inherit',
                    }}
                    title={`R${5 - rIdx}, F${fIdx + 1}: ${count} customers`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
