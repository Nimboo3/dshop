import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { logger } from './lib/logger';
import { 
  requestIdMiddleware,
  errorMiddleware, 
  notFoundMiddleware,
  defaultRateLimiter 
} from './middleware';
import { shopifyRouter } from './routes/shopify';
import { webhooksRouter } from './routes/webhooks';
import { apiRouter } from './routes/api';
import { segmentsRouter } from './routes/segments.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { closeAllQueues, getQueuesHealth } from './services/queue';

const app: Application = express();
const log = logger.child({ module: 'server' });

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for Shopify embedded apps
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.isDev
    ? ['http://localhost:3001', 'http://localhost:3000', /\.myshopify\.com$/]
    : [config.shopifyAppUrl, /\.myshopify\.com$/],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Shopify-Shop-Domain', 'X-Request-ID'],
}));

// Request ID middleware (first to ensure all logs have request ID)
app.use(requestIdMiddleware);

// Request logging
app.use((req: Request, res: Response, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    req.log.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    }, 'Request completed');
  });
  
  next();
});

// Parse JSON bodies (except for webhooks which need raw body)
app.use((req: Request, res: Response, next) => {
  if (req.path.startsWith('/webhooks')) {
    // Webhooks need raw body for HMAC verification
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// URL encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Default rate limiting for all routes
app.use(defaultRateLimiter);

// Health check endpoint (no auth required)
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    const redisStatus = redis.status;
    
    // Get queue health
    const queuesHealth = await getQueuesHealth();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: 'connected',
        redis: redisStatus === 'ready' ? 'connected' : redisStatus,
        queues: queuesHealth,
      },
    });
  } catch (error) {
    log.error({ error }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Readiness check for Kubernetes
app.get('/ready', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

// Routes
app.use('/auth', shopifyRouter);
app.use('/webhooks', webhooksRouter);
app.use('/api', apiRouter);
app.use('/api/segments', segmentsRouter);
app.use('/api/analytics', analyticsRouter);

// 404 handler
app.use(notFoundMiddleware);

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Received shutdown signal');
  
  // Close queues
  await closeAllQueues();
  
  // Disconnect from database
  await prisma.$disconnect();
  
  // Disconnect from Redis
  redis.disconnect();
  
  log.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error({ reason }, 'Unhandled rejection');
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  log.info({ port: PORT, env: config.nodeEnv }, 'Server started');
  log.info({
    database: 'PostgreSQL via Prisma',
    redis: config.redisUrl ? 'Connected' : 'Not configured',
  }, 'Services');
});

export default app;
