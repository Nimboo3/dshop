import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { config } from '../config/env';
import { verifyWebhookHmac } from '../lib/hmac';
import { webhookQueue, WebhookJobData } from '../services/queue';
import { webhookRateLimiter } from '../middleware';

export const webhooksRouter = Router();

// Apply webhook-specific rate limiting
webhooksRouter.use(webhookRateLimiter);

// Verify Shopify webhook signature
function verifyWebhook(req: Request): boolean {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const body = req.body;
  
  if (!hmac || !body) {
    return false;
  }

  // Body should be a Buffer from raw parser
  const bodyString = Buffer.isBuffer(body) ? body.toString('utf8') : JSON.stringify(body);
  return verifyWebhookHmac(bodyString, hmac, config.shopify.apiSecret);
}

// Store webhook event for audit
async function storeWebhookEvent(
  topic: string,
  shopDomain: string,
  payload: Record<string, unknown>,
  resourceType: string,
  resourceId?: string
): Promise<string | null> {
  try {
    // Find tenant by shop domain
    const tenant = await prisma.tenant.findUnique({
      where: { shopifyDomain: shopDomain },
      select: { id: true },
    });

    if (!tenant) {
      logger.warn({ shopDomain }, 'Webhook received for unknown tenant');
      return null;
    }

    const event = await prisma.webhookEvent.create({
      data: {
        tenantId: tenant.id,
        topic,
        shopifyDomain: shopDomain,
        payload,
        resourceType: resourceType as any,
        resourceId: resourceId || null,
        receivedAt: new Date(),
        processedAt: null,
        status: 'PENDING',
      },
    });

    return event.id;
  } catch (error) {
    logger.error({ error, topic, shopDomain }, 'Failed to store webhook event');
    return null;
  }
}

// Queue webhook for processing
async function queueWebhook(
  tenantId: string,
  topic: string,
  shopDomain: string,
  payload: Record<string, unknown>
): Promise<void> {
  const jobData: WebhookJobData = {
    tenantId,
    topic,
    shopDomain,
    payload,
    receivedAt: new Date().toISOString(),
  };

  await webhookQueue.add(`${topic}:${shopDomain}`, jobData, {
    jobId: `${topic}:${shopDomain}:${Date.now()}`,
  });
}

// APP_UNINSTALLED webhook
webhooksRouter.post('/app/uninstalled', async (req: Request, res: Response) => {
  try {
    if (!verifyWebhook(req)) {
      logger.warn('Invalid webhook signature for APP_UNINSTALLED');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const topic = req.get('X-Shopify-Topic');
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    
    logger.info({ shopDomain, topic }, `Received ${topic} webhook`);

    if (shopDomain) {
      // Store the event first
      await storeWebhookEvent(topic || 'app/uninstalled', shopDomain, body, 'TENANT');

      // Update tenant status to CHURNED and clear access token
      await prisma.tenant.update({
        where: { shopifyDomain: shopDomain },
        data: {
          status: 'CHURNED',
          accessToken: '', // Clear access token for security
          accessTokenHash: '',
        },
      });

      // Delete active sessions
      await prisma.session.deleteMany({ where: { shop: shopDomain } });
      
      logger.info({ shopDomain }, 'Processed app uninstall');
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'APP_UNINSTALLED webhook error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// APP_SCOPES_UPDATE webhook
webhooksRouter.post('/app/scopes_update', async (req: Request, res: Response) => {
  try {
    if (!verifyWebhook(req)) {
      logger.warn('Invalid webhook signature for APP_SCOPES_UPDATE');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const topic = req.get('X-Shopify-Topic');
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    
    logger.info({ shopDomain, topic }, `Received ${topic} webhook`);

    if (shopDomain && body.current) {
      // Store the event
      await storeWebhookEvent(topic || 'app/scopes_update', shopDomain, body, 'TENANT');

      const session = await prisma.session.findFirst({ where: { shop: shopDomain } });
      
      if (session) {
        await prisma.session.update({
          where: { id: session.id },
          data: { scope: body.current.toString() },
        });
        logger.info({ shopDomain }, 'Updated scopes for shop');
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'APP_SCOPES_UPDATE webhook error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// CUSTOMERS_CREATE, CUSTOMERS_UPDATE, CUSTOMERS_DELETE webhooks
webhooksRouter.post('/customers/:action', async (req: Request, res: Response) => {
  try {
    if (!verifyWebhook(req)) {
      logger.warn({ action: req.params.action }, 'Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const topic = req.get('X-Shopify-Topic');
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    
    logger.info({ shopDomain, topic }, `Received ${topic} webhook`);

    if (shopDomain) {
      const eventId = await storeWebhookEvent(
        topic || `customers/${req.params.action}`,
        shopDomain,
        body,
        'CUSTOMER',
        body.id?.toString()
      );

      if (eventId) {
        const tenant = await prisma.tenant.findUnique({
          where: { shopifyDomain: shopDomain },
          select: { id: true },
        });

        if (tenant) {
          await queueWebhook(tenant.id, topic || '', shopDomain, body);
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Customer webhook error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ORDERS_CREATE, ORDERS_UPDATED, ORDERS_CANCELLED, ORDERS_PAID webhooks
webhooksRouter.post('/orders/:action', async (req: Request, res: Response) => {
  try {
    if (!verifyWebhook(req)) {
      logger.warn({ action: req.params.action }, 'Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const topic = req.get('X-Shopify-Topic');
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    
    logger.info({ shopDomain, topic }, `Received ${topic} webhook`);

    if (shopDomain) {
      const eventId = await storeWebhookEvent(
        topic || `orders/${req.params.action}`,
        shopDomain,
        body,
        'ORDER',
        body.id?.toString()
      );

      if (eventId) {
        const tenant = await prisma.tenant.findUnique({
          where: { shopifyDomain: shopDomain },
          select: { id: true },
        });

        if (tenant) {
          await queueWebhook(tenant.id, topic || '', shopDomain, body);
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Order webhook error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Generic webhook handler for other webhooks
webhooksRouter.post('/:topic', async (req: Request, res: Response) => {
  try {
    if (!verifyWebhook(req)) {
      logger.warn({ topic: req.params.topic }, 'Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const topic = req.get('X-Shopify-Topic') || req.params.topic;
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    
    logger.info({ shopDomain, topic }, `Received ${topic} webhook`);

    if (shopDomain) {
      // Store the event
      await storeWebhookEvent(topic, shopDomain, body, 'OTHER');

      // Find tenant and queue for processing
      const tenant = await prisma.tenant.findUnique({
        where: { shopifyDomain: shopDomain },
        select: { id: true },
      });

      if (tenant) {
        await queueWebhook(tenant.id, topic, shopDomain, body);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Webhook processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
