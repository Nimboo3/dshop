'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

interface ShopContextValue {
  /** The shop domain (e.g., "my-store.myshopify.com") */
  shop: string | null;
  /** Whether the shop context is being loaded */
  isLoading: boolean;
  /** Error message if shop context couldn't be established */
  error: string | null;
  /** Headers to include in API requests */
  getApiHeaders: () => Record<string, string>;
  /** Set shop manually (for testing or admin override) */
  setShop: (shop: string) => void;
}

const ShopContext = createContext<ShopContextValue | undefined>(undefined);

interface ShopProviderProps {
  children: ReactNode;
}

/**
 * Provider that manages shop context for the application.
 * 
 * The shop domain is determined in the following priority:
 * 1. URL search params (?shop=...)
 * 2. Session storage (persisted from previous visit)
 * 3. Manual override via setShop()
 * 
 * This follows best practices for multi-tenant Shopify apps.
 */
export function ShopProvider({ children }: ShopProviderProps) {
  const searchParams = useSearchParams();
  const [shop, setShopState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize shop from URL params or session storage
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    try {
      // Priority 1: URL search params
      const shopFromUrl = searchParams.get('shop');
      if (shopFromUrl) {
        // Validate shop domain format
        if (isValidShopDomain(shopFromUrl)) {
          setShopState(shopFromUrl);
          // Persist to session storage
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('shopify_shop', shopFromUrl);
          }
        } else {
          setError(`Invalid shop domain: ${shopFromUrl}`);
        }
        setIsLoading(false);
        return;
      }

      // Priority 2: Session storage
      if (typeof window !== 'undefined') {
        const shopFromStorage = sessionStorage.getItem('shopify_shop');
        if (shopFromStorage && isValidShopDomain(shopFromStorage)) {
          setShopState(shopFromStorage);
          setIsLoading(false);
          return;
        }
      }

      // No shop context available
      setIsLoading(false);
    } catch (err) {
      setError('Failed to initialize shop context');
      setIsLoading(false);
    }
  }, [searchParams]);

  // Manual shop setter
  const setShop = useCallback((newShop: string) => {
    if (isValidShopDomain(newShop)) {
      setShopState(newShop);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('shopify_shop', newShop);
      }
      setError(null);
    } else {
      setError(`Invalid shop domain: ${newShop}`);
    }
  }, []);

  // Get headers for API requests
  const getApiHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (shop) {
      headers['X-Shopify-Shop-Domain'] = shop;
    }

    return headers;
  }, [shop]);

  const value = useMemo(
    () => ({
      shop,
      isLoading,
      error,
      getApiHeaders,
      setShop,
    }),
    [shop, isLoading, error, getApiHeaders, setShop]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

/**
 * Hook to access shop context
 */
export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (context === undefined) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
}

/**
 * Hook that requires shop context to be available
 * Throws error if used outside provider or if shop is not set
 */
export function useRequiredShop(): string {
  const { shop, isLoading, error } = useShop();

  if (isLoading) {
    throw new Error('Shop context is still loading');
  }

  if (error) {
    throw new Error(error);
  }

  if (!shop) {
    throw new Error('Shop context is required but not available');
  }

  return shop;
}

/**
 * Validate Shopify shop domain format
 */
function isValidShopDomain(shop: string): boolean {
  // Must be a valid myshopify.com domain or custom domain
  const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  const customDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/;
  
  return shopifyDomainRegex.test(shop) || customDomainRegex.test(shop);
}

export { ShopContext };
