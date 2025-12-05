import { createShopifyClient } from './shopify';
import { logger } from '../lib/logger';
import { config } from '../config/env';

const log = logger.child({ module: 'webhook-registration' });

/**
 * Required webhooks for the application
 */
const REQUIRED_WEBHOOKS = [
  { topic: 'APP_UNINSTALLED', path: '/webhooks/app/uninstalled' },
  { topic: 'APP_SCOPES_UPDATE', path: '/webhooks/app/scopes_update' },
  { topic: 'CUSTOMERS_CREATE', path: '/webhooks/customers/create' },
  { topic: 'CUSTOMERS_UPDATE', path: '/webhooks/customers/update' },
  { topic: 'CUSTOMERS_DELETE', path: '/webhooks/customers/delete' },
  { topic: 'ORDERS_CREATE', path: '/webhooks/orders/create' },
  { topic: 'ORDERS_UPDATED', path: '/webhooks/orders/updated' },
  { topic: 'ORDERS_CANCELLED', path: '/webhooks/orders/cancelled' },
  { topic: 'ORDERS_PAID', path: '/webhooks/orders/paid' },
];

/**
 * GraphQL mutation to create a webhook subscription
 */
const CREATE_WEBHOOK_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        endpoint {
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * GraphQL query to get existing webhook subscriptions
 */
const GET_WEBHOOKS_QUERY = `
  query webhookSubscriptions($first: Int!) {
    webhookSubscriptions(first: $first) {
      edges {
        node {
          id
          topic
          endpoint {
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL mutation to delete a webhook subscription
 */
const DELETE_WEBHOOK_MUTATION = `
  mutation webhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors {
        field
        message
      }
    }
  }
`;

interface WebhookSubscriptionResponse {
  webhookSubscriptionCreate: {
    webhookSubscription: {
      id: string;
      topic: string;
      endpoint: {
        callbackUrl: string;
      };
    } | null;
    userErrors: Array<{ field: string; message: string }>;
  };
}

interface WebhooksQueryResponse {
  webhookSubscriptions: {
    edges: Array<{
      node: {
        id: string;
        topic: string;
        endpoint: {
          callbackUrl: string;
        };
      };
    }>;
  };
}

/**
 * Register all required webhooks for a tenant
 */
export async function registerWebhooks(tenantId: string): Promise<void> {
  log.info({ tenantId }, 'Registering webhooks');
  
  const client = await createShopifyClient(tenantId);
  const baseUrl = config.shopify.appUrl;
  
  // Get existing webhooks
  const existingWebhooksResponse = await client.graphql.request<WebhooksQueryResponse>(
    GET_WEBHOOKS_QUERY,
    { first: 50 }
  );
  
  const existingWebhooks = new Map(
    existingWebhooksResponse.webhookSubscriptions.edges.map(edge => [
      edge.node.topic,
      { id: edge.node.id, callbackUrl: edge.node.endpoint.callbackUrl }
    ])
  );
  
  // Register or update each required webhook
  for (const webhook of REQUIRED_WEBHOOKS) {
    const callbackUrl = `${baseUrl}${webhook.path}`;
    const existing = existingWebhooks.get(webhook.topic);
    
    // Skip if already registered with correct URL
    if (existing && existing.callbackUrl === callbackUrl) {
      log.debug({ topic: webhook.topic }, 'Webhook already registered');
      continue;
    }
    
    // Delete old webhook if exists with different URL
    if (existing) {
      try {
        await client.graphql.request(DELETE_WEBHOOK_MUTATION, { id: existing.id });
        log.debug({ topic: webhook.topic }, 'Deleted old webhook');
      } catch (error) {
        log.warn({ topic: webhook.topic, error }, 'Failed to delete old webhook');
      }
    }
    
    // Create new webhook
    try {
      const response = await client.graphql.request<WebhookSubscriptionResponse>(
        CREATE_WEBHOOK_MUTATION,
        {
          topic: webhook.topic,
          webhookSubscription: {
            callbackUrl,
            format: 'JSON',
          },
        }
      );
      
      if (response.webhookSubscriptionCreate.userErrors.length > 0) {
        log.error({ 
          topic: webhook.topic, 
          errors: response.webhookSubscriptionCreate.userErrors 
        }, 'Failed to create webhook');
      } else {
        log.info({ topic: webhook.topic, callbackUrl }, 'Webhook registered');
      }
    } catch (error) {
      log.error({ topic: webhook.topic, error }, 'Failed to register webhook');
    }
  }
  
  log.info({ tenantId }, 'Webhook registration completed');
}

/**
 * Unregister all webhooks for a tenant
 */
export async function unregisterWebhooks(tenantId: string): Promise<void> {
  log.info({ tenantId }, 'Unregistering webhooks');
  
  const client = await createShopifyClient(tenantId);
  
  // Get existing webhooks
  const existingWebhooksResponse = await client.graphql.request<WebhooksQueryResponse>(
    GET_WEBHOOKS_QUERY,
    { first: 50 }
  );
  
  // Delete all webhooks
  for (const edge of existingWebhooksResponse.webhookSubscriptions.edges) {
    try {
      await client.graphql.request(DELETE_WEBHOOK_MUTATION, { id: edge.node.id });
      log.debug({ topic: edge.node.topic }, 'Webhook deleted');
    } catch (error) {
      log.warn({ topic: edge.node.topic, error }, 'Failed to delete webhook');
    }
  }
  
  log.info({ tenantId }, 'Webhook unregistration completed');
}
