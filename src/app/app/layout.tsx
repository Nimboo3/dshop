'use client';

import { NavMenu, TitleBar } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Target,
  BarChart3,
  Settings,
} from 'lucide-react';
import '@shopify/polaris/build/esm/styles.css';

const navItems = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard },
  { href: '/app/customers', label: 'Customers', icon: Users },
  { href: '/app/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/app/segments', label: 'Segments', icon: Target },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3 },
];

function AppNavigation() {
  return (
    <>
      <TitleBar title="Xeno FDE Platform" />
      <NavMenu>
        <a href="/app" rel="home">Home</a>
        <a href="/app/customers">Customers</a>
        <a href="/app/orders">Orders</a>
        <a href="/app/segments">Segments</a>
        <a href="/app/analytics">Analytics</a>
      </NavMenu>
    </>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');

  // Build href with shop param preserved
  const buildHref = (path: string) => {
    const params = new URLSearchParams();
    if (shop) params.set('shop', shop);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href={buildHref('/app')} className="flex items-center gap-2 font-semibold">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
            X
          </div>
          <span>Xeno FDE</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/app' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={buildHref(item.href)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">
          Connected: {shop || 'No shop connected'}
        </div>
      </div>
    </aside>
  );
}

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <AppNavigation />
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    }>
      <AppLayoutContent>{children}</AppLayoutContent>
    </Suspense>
  );
}
