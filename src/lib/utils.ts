import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format number with locale
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Format date
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'just now' : `${diffMinutes} minutes ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Get RFM segment color class
 */
export function getRfmSegmentColor(segment: string): string {
  const colors: Record<string, string> = {
    CHAMPIONS: 'bg-emerald-500',
    LOYAL_CUSTOMERS: 'bg-blue-500',
    POTENTIAL_LOYALISTS: 'bg-violet-500',
    NEW_CUSTOMERS: 'bg-cyan-500',
    PROMISING: 'bg-teal-500',
    NEED_ATTENTION: 'bg-amber-500',
    ABOUT_TO_SLEEP: 'bg-red-400',
    AT_RISK: 'bg-red-600',
    CANT_LOSE: 'bg-orange-500',
    HIBERNATING: 'bg-gray-500',
    LOST: 'bg-gray-700',
  };
  return colors[segment] || 'bg-gray-400';
}

/**
 * Get RFM segment display name
 */
export function getRfmSegmentName(segment: string): string {
  const names: Record<string, string> = {
    CHAMPIONS: 'Champions',
    LOYAL_CUSTOMERS: 'Loyal Customers',
    POTENTIAL_LOYALISTS: 'Potential Loyalists',
    NEW_CUSTOMERS: 'New Customers',
    PROMISING: 'Promising',
    NEED_ATTENTION: 'Need Attention',
    ABOUT_TO_SLEEP: 'About to Sleep',
    AT_RISK: 'At Risk',
    CANT_LOSE: "Can't Lose",
    HIBERNATING: 'Hibernating',
    LOST: 'Lost',
  };
  return names[segment] || segment;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
