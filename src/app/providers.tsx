'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, Suspense } from 'react';
import { ShopProvider } from '@/hooks/use-shop';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
        <ShopProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ShopProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
