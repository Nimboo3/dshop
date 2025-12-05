import '@shopify/shopify-api/adapters/node';
import {
  shopifyApi,
  LATEST_API_VERSION,
  Session,
  ApiVersion,
} from '@shopify/shopify-api';
import { config } from '../config/env';

// Extract hostname from app URL
const hostName = new URL(config.shopify.appUrl).hostname;

export const shopify = shopifyApi({
  apiKey: config.shopify.apiKey,
  apiSecretKey: config.shopify.apiSecret,
  scopes: config.shopify.scopes,
  hostName,
  apiVersion: config.shopify.apiVersion as ApiVersion,
  isEmbeddedApp: true,
});

export { Session, LATEST_API_VERSION };
