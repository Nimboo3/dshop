import { shopify } from '../../lib/shopify';
import { decrypt } from '../../lib/crypto';
import { prisma } from '../../config/database';
import { logger } from '../../lib/logger';
import { ServiceUnavailableError, UnauthorizedError } from '../../lib/errors';
import { config } from '../../config/env';

const log = logger.child({ module: 'shopify-client' });

/**
 * GraphQL client wrapper for Shopify Admin API
 */
export interface ShopifyGraphQLClient {
  request: <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

/**
 * REST client wrapper for Shopify Admin API
 */
export interface ShopifyRestClient {
  get: <T = unknown>(path: string) => Promise<T>;
  post: <T = unknown>(path: string, data?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, data?: unknown) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
}

/**
 * Create a Shopify Admin API client for a tenant
 */
export async function createShopifyClient(tenantId: string): Promise<{
  graphql: ShopifyGraphQLClient;
  rest: ShopifyRestClient;
  shopDomain: string;
}> {
  // Get tenant with encrypted access token
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      shopifyDomain: true,
      accessToken: true,
      status: true,
    },
  });

  if (!tenant) {
    throw new UnauthorizedError('Tenant not found');
  }

  if (tenant.status !== 'ACTIVE') {
    throw new UnauthorizedError('Tenant is not active');
  }

  if (!tenant.accessToken) {
    throw new UnauthorizedError('No access token available');
  }

  // Decrypt the access token
  let decryptedToken: string;
  try {
    decryptedToken = decrypt(tenant.accessToken);
  } catch (error) {
    log.error({ tenantId, error }, 'Failed to decrypt access token');
    throw new ServiceUnavailableError('Failed to authenticate with Shopify');
  }

  // Create session object for Shopify API
  const session = {
    id: `${tenant.shopifyDomain}_session`,
    shop: tenant.shopifyDomain,
    state: '',
    isOnline: false,
    accessToken: decryptedToken,
  };

  // Create GraphQL client
  const graphqlClient = new shopify.clients.Graphql({ session: session as any });

  // Create REST client
  const restClient = new shopify.clients.Rest({ session: session as any });

  return {
    graphql: {
      request: async <T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> => {
        try {
          const response = await graphqlClient.request(query, { variables });
          
          // Check for GraphQL errors
          if ((response as any).errors) {
            const errors = (response as any).errors;
            log.error({ tenantId, errors }, 'GraphQL errors');
            throw new ServiceUnavailableError(`Shopify API error: ${errors[0]?.message || 'Unknown error'}`);
          }
          
          return (response as any).data as T;
        } catch (error: any) {
          if (error.response?.code === 401) {
            throw new UnauthorizedError('Shopify access token is invalid or expired');
          }
          throw error;
        }
      },
    },
    rest: {
      get: async <T = unknown>(path: string): Promise<T> => {
        const response = await restClient.get({ path });
        return response.body as T;
      },
      post: async <T = unknown>(path: string, data?: unknown): Promise<T> => {
        const response = await restClient.post({ path, data: data as any });
        return response.body as T;
      },
      put: async <T = unknown>(path: string, data?: unknown): Promise<T> => {
        const response = await restClient.put({ path, data: data as any });
        return response.body as T;
      },
      delete: async <T = unknown>(path: string): Promise<T> => {
        const response = await restClient.delete({ path });
        return response.body as T;
      },
    },
    shopDomain: tenant.shopifyDomain,
  };
}

/**
 * Increment API call counter for rate limiting tracking
 */
export async function incrementApiCallCount(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      monthlyApiCalls: { increment: 1 },
    },
  });
}

/**
 * Check if tenant has exceeded API call limit
 */
export async function checkApiLimit(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { monthlyApiCalls: true, apiCallLimit: true },
  });

  if (!tenant) return false;
  return tenant.monthlyApiCalls < tenant.apiCallLimit;
}
