import { Router, Request, Response } from 'express';
import { shopify } from '../lib/shopify';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { config } from '../config/env';
import { authRateLimiter } from '../middleware';
import { encrypt, hash } from '../lib/crypto';
import { registerWebhooks } from '../services/webhooks';
import { customerSyncQueue, orderSyncQueue } from '../services/queue';

export const shopifyRouter = Router();

// Apply stricter rate limiting for auth routes
shopifyRouter.use(authRateLimiter);

// OAuth callback - handles the redirect from Shopify after authorization
shopifyRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const { shop, code, state } = req.query;
    
    if (!shop || !code) {
      return res.status(400).json({ error: 'Missing shop or code parameter' });
    }

    // Exchange the authorization code for an access token
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;
    
    // Store the session in the database
    await prisma.session.upsert({
      where: { id: session.id },
      update: {
        shop: session.shop,
        state: session.state || '',
        isOnline: session.isOnline || false,
        scope: session.scope,
        expires: session.expires,
        accessToken: session.accessToken || '',
      },
      create: {
        id: session.id,
        shop: session.shop,
        state: session.state || '',
        isOnline: session.isOnline || false,
        scope: session.scope,
        expires: session.expires,
        accessToken: session.accessToken || '',
      },
    });

    // Upsert tenant record with encrypted access token
    const encryptedToken = session.accessToken 
      ? encrypt(session.accessToken) 
      : '';
    const tokenHash = session.accessToken 
      ? hash(session.accessToken) 
      : '';

    await prisma.tenant.upsert({
      where: { shopifyDomain: session.shop },
      update: {
        accessToken: encryptedToken,
        accessTokenHash: tokenHash,
        scope: session.scope?.split(',') || [],
        status: 'ACTIVE',
      },
      create: {
        shopifyDomain: session.shop,
        shopName: session.shop.replace('.myshopify.com', ''),
        accessToken: encryptedToken,
        accessTokenHash: tokenHash,
        scope: session.scope?.split(',') || [],
        status: 'ACTIVE',
        planTier: 'FREE',
      },
    });

    // Get tenant ID for webhook registration and initial sync
    const tenant = await prisma.tenant.findUnique({
      where: { shopifyDomain: session.shop },
      select: { id: true },
    });

    if (tenant) {
      // Register webhooks in background
      registerWebhooks(tenant.id).catch((error) => {
        logger.error({ error, tenantId: tenant.id }, 'Failed to register webhooks');
      });

      // Queue initial sync jobs
      await customerSyncQueue.add(`initial-customer-sync:${tenant.id}`, {
        tenantId: tenant.id,
        shopDomain: session.shop,
        mode: 'full',
      });

      await orderSyncQueue.add(`initial-order-sync:${tenant.id}`, {
        tenantId: tenant.id,
        shopDomain: session.shop,
        mode: 'full',
      });
    }

    logger.info({ shop: session.shop }, 'OAuth completed successfully');
    
    // Redirect to the app
    const redirectUrl = `${config.frontendUrl}/app?shop=${session.shop}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error({ error }, 'OAuth callback error');
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// Initiate OAuth flow
shopifyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { shop } = req.query;
    
    if (!shop || typeof shop !== 'string') {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const authUrl = await shopify.auth.begin({
      shop,
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    res.redirect(authUrl);
  } catch (error) {
    logger.error({ error }, 'OAuth begin error');
    res.status(500).json({ error: 'Failed to begin OAuth' });
  }
});

// Login route
shopifyRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { shop } = req.body;
    
    if (!shop || typeof shop !== 'string') {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    // Validate shop domain
    const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
    if (!sanitizedShop) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    res.json({ redirectUrl: `/auth?shop=${sanitizedShop}` });
  } catch (error) {
    logger.error({ error }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});
