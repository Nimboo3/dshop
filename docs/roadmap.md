Xeno FDE Assignment - Elite Execution Roadmap
Mission: Build a production-grade multi-tenant Shopify data platform that demonstrates Forward Deployed Engineer capabilities - not a toy demo.
Timeline: 12 days to deployment
Evaluation Weight: Problem Solving (35%) | Engineering Fluency (35%) | Communication (20%) | Polish (10%)

🎯 Strategic Positioning
What Xeno FDE Really Wants to See:

Enterprise-grade multi-tenancy - Not "just add a tenant_id column"
Real-time data sync at scale - Webhooks + async processing, not polling
Production patterns - Error handling, monitoring, retries, idempotency
Business intelligence - RFM segmentation, customer lifecycle, actionable insights
Customer-facing polish - They deploy this to customers; it needs to inspire confidence

Key Differentiators vs Other Candidates:

✅ Event-driven architecture (not cron-based sync)
✅ Advanced SQL for analytics (window functions, CTEs, aggregates)
✅ Industry-standard patterns (idempotency keys, webhook verification, rate limiting)
✅ Operational excellence (health checks, structured logging, graceful degradation)


🏗️ Final Architecture (What You're Building)
┌─────────────────────────────────────────────────────────────────┐
│                         Shopify Store                           │
│                    (Development Store)                          │
└────────────┬──────────────────────────┬────────────────────────┘
             │ OAuth 2.0                │ Webhooks (HMAC signed)
             ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (Express.js)                    │
│  ┌──────────────┬─────────────┬──────────────┬────────────┐   │
│  │   Auth       │  Webhooks   │  Analytics   │  Segments  │   │
│  │  /oauth      │  /webhooks  │  /api/v1/*   │  /api/v1/* │   │
│  └──────────────┴─────────────┴──────────────┴────────────┘   │
└────────────┬──────────────────────────┬────────────────────────┘
             │                          │ Enqueue Job
             ▼                          ▼
┌──────────────────────┐    ┌──────────────────────────────────┐
│   PostgreSQL         │    │      Redis (Upstash)             │
│   (Railway)          │    │  ┌────────────────────────────┐  │
│                      │    │  │  BullMQ Queues:            │  │
│  ┌─────────────┐    │    │  │  • webhook-processor       │  │
│  │ Tenants     │    │    │  │  • customer-sync           │  │
│  │ Customers   │    │◄───┼──│  • order-sync              │  │
│  │ Orders      │    │    │  │  • segment-compute         │  │
│  │ Products    │    │    │  │  • rfm-analysis            │  │
│  │ Events      │    │    │  └────────────────────────────┘  │
│  │ Segments    │    │    │  Cache Layer (5min TTL):         │
│  │ WebhookLog  │    │    │  • dashboard-metrics             │
│  │ SyncJobs    │    │    │  • customer-aggregates           │
│  └─────────────┘    │    └──────────────────────────────────┘
└──────────────────────┘                   │
             ▲                             │ Process Jobs
             │                             ▼
             │              ┌──────────────────────────────────┐
             │              │   Worker Processes (BullMQ)      │
             │              │  ┌────────────────────────────┐  │
             └──────────────┤  │  • Webhook Handler         │  │
                            │  │  • Data Transformers       │  │
                            │  │  • Aggregate Updater       │  │
                            │  │  • Segment Computer        │  │
                            │  └────────────────────────────┘  │
                            └──────────────────────────────────┘
                                           │
                                           │ Server-Sent Events
                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Dashboard (Next.js 14 + React Server Components)   │
│  ┌──────────────┬─────────────┬──────────────┬────────────┐   │
│  │  Overview    │  Customers  │   Segments   │    RFM     │   │
│  │  • KPIs      │  • Lists    │   • Builder  │  • Matrix  │   │
│  │  • Charts    │  • Filters  │   • Preview  │  • Cohorts │   │
│  └──────────────┴─────────────┴──────────────┴────────────┘   │
└─────────────────────────────────────────────────────────────────┘
Data Flow (Critical Path):

OAuth → Store connects → Access token encrypted in DB
Initial Sync → Background job fetches 6 months of historical data
Webhook Registration → App subscribes to 8 critical events
Real-time Updates → Order created → Webhook → Queue → Process → Update aggregates → Cache invalidation → Dashboard refreshes


📚 Tech Stack (Non-Negotiable Choices)
Backend: Node.js 20 + TypeScript + Express
Why: Assignment preference + shows TS fluency + Express is industry standard
json{
  "dependencies": {
    "express": "^4.19.2",
    "typescript": "^5.5.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0"
  }
}
Queue: BullMQ + Redis (Upstash)
Why: Mandatory for webhook processing (Shopify 5-second timeout), better than RabbitMQ for JS ecosystem
json{
  "dependencies": {
    "bullmq": "^5.12.0",
    "ioredis": "^5.4.1"
  }
}
ORM: Prisma
Why: Assignment requirement, best TypeScript support, excellent migrations
json{
  "dependencies": {
    "@prisma/client": "^5.19.0",
    "prisma": "^5.19.0"
  }
}
Database: PostgreSQL (Railway)
Why: Assignment requirement (RDBMS for SQL interviews), JSON support, window functions for RFM

Free Tier: 512MB RAM, 1GB storage, 10K rows
Connection String: postgresql://user:pass@postgres.railway.app:5432/railway

Frontend: Next.js 14 (App Router) + React
json{
  "dependencies": {
    "next": "14.2.5",
    "react": "^18.3.1",
    "@tanstack/react-query": "^5.51.0",
    "recharts": "^2.12.0",
    "shadcn/ui": "latest"
  }
}
Deployment

API + Worker: Railway (Single service, worker runs in same process initially)
Frontend: Vercel (Zero config Next.js deployment)
Redis: Upstash (Serverless Redis, generous free tier)

Monitoring & Observability
json{
  "dependencies": {
    "@sentry/node": "^8.26.0",
    "pino": "^9.3.0",
    "pino-pretty": "^11.2.0"
  }
}

🗄️ Database Schema (Interview-Ready SQL)
prisma// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================================
// MULTI-TENANCY CORE
// ============================================================================

model Tenant {
  id                String   @id @default(uuid())
  shopifyDomain     String   @unique
  shopName          String?
  email             String?
  accessToken       String   @db.Text  // AES-256 encrypted
  accessTokenHash   String   // SHA-256 for quick lookup without decryption
  scope             String[] // Granted OAuth scopes
  
  // Subscription & limits
  status            TenantStatus @default(ACTIVE)
  planTier          PlanTier     @default(FREE)
  monthlyApiCalls   Int          @default(0)
  apiCallLimit      Int          @default(10000)
  
  // Relationships
  customers         Customer[]
  orders            Order[]
  products          Product[]
  segments          Segment[]
  events            Event[]
  webhookEvents     WebhookEvent[]
  syncJobs          SyncJob[]
  
  // Metadata
  onboardedAt       DateTime @default(now())
  lastSyncAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([shopifyDomain])
  @@index([status, planTier])
  @@map("tenants")
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  CHURNED
}

enum PlanTier {
  FREE
  STARTER
  GROWTH
  ENTERPRISE
}

// ============================================================================
// CUSTOMER DOMAIN (RFM-Optimized)
// ============================================================================

model Customer {
  id                String   @id @default(uuid())
  tenantId          String
  shopifyId         String   @db.BigInt  // Shopify uses Int64
  
  // Identity
  email             String?
  phone             String?
  firstName         String?
  lastName          String?
  
  // Computed Metrics (Denormalized for Performance)
  totalSpent        Decimal  @default(0) @db.Decimal(12, 2)
  ordersCount       Int      @default(0)
  avgOrderValue     Decimal  @default(0) @db.Decimal(12, 2)
  lastOrderDate     DateTime?
  firstOrderDate    DateTime?
  daysSinceLastOrder Int?    // Computed daily
  
  // RFM Scores (1-5 scale, computed daily)
  recencyScore      Int?     @db.SmallInt
  frequencyScore    Int?     @db.SmallInt
  monetaryScore     Int?     @db.SmallInt
  rfmSegment        RFMSegment?
  rfmComputedAt     DateTime?
  
  // Behavioral flags
  isHighValue       Boolean  @default(false)  // totalSpent > P90
  isChurnRisk       Boolean  @default(false)  // No order in 90 days
  hasAbandonedCart  Boolean  @default(false)
  
  // Relationships
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orders            Order[]
  events            Event[]
  segmentMembers    SegmentMember[]
  
  // Timestamps
  shopifyCreatedAt  DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@unique([tenantId, shopifyId])
  @@index([tenantId, email])
  @@index([tenantId, totalSpent(sort: Desc)])
  @@index([tenantId, lastOrderDate(sort: Desc)])
  @@index([tenantId, rfmSegment])
  @@index([tenantId, isHighValue])
  @@map("customers")
}

enum RFMSegment {
  CHAMPIONS          // 5,5,5 - Best customers
  LOYAL              // 4-5, 4-5, 3-5
  POTENTIAL_LOYALIST // 3-5, 1-3, 1-3
  NEW_CUSTOMERS      // 5, 1, 1
  PROMISING          // 4-5, 1, 1
  NEED_ATTENTION     // 3-4, 3-4, 3-4
  ABOUT_TO_SLEEP     // 2-3, 2-3, 2-3
  AT_RISK            // 2-3, 3-5, 3-5
  CANNOT_LOSE        // 1-2, 4-5, 4-5
  HIBERNATING        // 1-2, 1-2, 1-2
  LOST               // 1, 1, 1-2
}

// ============================================================================
// ORDER DOMAIN
// ============================================================================

model Order {
  id                String   @id @default(uuid())
  tenantId          String
  shopifyId         String   @db.BigInt
  customerId        String?
  
  // Order details
  orderNumber       Int
  orderName         String   // e.g., "#1001"
  totalPrice        Decimal  @db.Decimal(12, 2)
  subtotalPrice     Decimal  @db.Decimal(12, 2)
  totalTax          Decimal  @db.Decimal(12, 2)
  totalDiscounts    Decimal  @db.Decimal(12, 2)
  
  // Status
  financialStatus   FinancialStatus
  fulfillmentStatus FulfillmentStatus?
  cancelledAt       DateTime?
  
  // Line items (JSON for flexibility)
  lineItems         Json     // Array of {product_id, title, quantity, price}
  lineItemsCount    Int      @default(0)
  
  // Dimensions (for analytics)
  currency          String   @default("USD") @db.VarChar(3)
  orderDate         DateTime
  orderMonth        String   // YYYY-MM for partitioning
  
  // Relationships
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer          Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  
  // Timestamps
  shopifyCreatedAt  DateTime
  shopifyUpdatedAt  DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@unique([tenantId, shopifyId])
  @@index([tenantId, orderDate(sort: Desc)])
  @@index([tenantId, customerId])
  @@index([tenantId, orderMonth])
  @@index([tenantId, financialStatus])
  @@map("orders")
}

enum FinancialStatus {
  PENDING
  AUTHORIZED
  PARTIALLY_PAID
  PAID
  PARTIALLY_REFUNDED
  REFUNDED
  VOIDED
}

enum FulfillmentStatus {
  FULFILLED
  PARTIAL
  RESTOCKED
  PENDING
}

// ============================================================================
// PRODUCT CATALOG
// ============================================================================

model Product {
  id                String   @id @default(uuid())
  tenantId          String
  shopifyId         String   @db.BigInt
  
  // Product info
  title             String
  description       String?  @db.Text
  vendor            String?
  productType       String?
  status            ProductStatus @default(ACTIVE)
  
  // Pricing (from first variant for simplicity)
  price             Decimal? @db.Decimal(12, 2)
  compareAtPrice    Decimal? @db.Decimal(12, 2)
  
  // Variants (JSON array)
  variants          Json
  variantCount      Int      @default(1)
  
  // Media
  images            Json     // Array of {src, alt}
  featuredImage     String?  @db.Text
  
  // Relationships
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Timestamps
  shopifyCreatedAt  DateTime
  shopifyUpdatedAt  DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@unique([tenantId, shopifyId])
  @@index([tenantId, status])
  @@index([tenantId, productType])
  @@map("products")
}

enum ProductStatus {
  ACTIVE
  ARCHIVED
  DRAFT
}

// ============================================================================
// EVENTS (Cart Abandonment, Checkouts)
// ============================================================================

model Event {
  id                String    @id @default(uuid())
  tenantId          String
  customerId        String?
  
  // Event classification
  eventType         EventType
  eventSource       EventSource @default(WEBHOOK)
  
  // Event payload
  payload           Json
  value             Decimal?  @db.Decimal(12, 2)  // Cart value, order value, etc.
  
  // Context
  sessionId         String?
  userAgent         String?   @db.Text
  ipAddress         String?
  
  // Relationships
  tenant            Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer          Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  
  // Timestamps
  occurredAt        DateTime
  createdAt         DateTime  @default(now())
  
  @@index([tenantId, eventType, occurredAt(sort: Desc)])
  @@index([tenantId, customerId])
  @@map("events")
}

enum EventType {
  CART_ABANDONED
  CHECKOUT_STARTED
  CHECKOUT_COMPLETED
  CHECKOUT_ABANDONED
  PRODUCT_VIEWED
  PRODUCT_ADDED_TO_CART
}

enum EventSource {
  WEBHOOK
  API
  BATCH_IMPORT
}

// ============================================================================
// SEGMENTATION ENGINE
// ============================================================================

model Segment {
  id                String   @id @default(uuid())
  tenantId          String
  
  // Segment definition
  name              String
  description       String?  @db.Text
  filters           Json     // Flexible filter DSL
  
  // Computed state
  customerCount     Int      @default(0)
  estimatedRevenue  Decimal  @default(0) @db.Decimal(12, 2)
  lastComputedAt    DateTime?
  
  // Metadata
  isActive          Boolean  @default(true)
  createdBy         String?  // User ID if multi-user
  
  // Relationships
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  members           SegmentMember[]
  
  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([tenantId, isActive])
  @@map("segments")
}

model SegmentMember {
  id                String   @id @default(uuid())
  segmentId         String
  customerId        String
  
  // Snapshot of customer state when added
  totalSpentSnapshot Decimal @db.Decimal(12, 2)
  rfmSegmentSnapshot RFMSegment?
  
  // Relationships
  segment           Segment  @relation(fields: [segmentId], references: [id], onDelete: Cascade)
  customer          Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  
  // Timestamps
  addedAt           DateTime @default(now())
  
  @@unique([segmentId, customerId])
  @@index([segmentId])
  @@index([customerId])
  @@map("segment_members")
}

// ============================================================================
// OPERATIONAL TABLES
// ============================================================================

model WebhookEvent {
  id                String   @id @default(uuid())
  tenantId          String
  
  // Shopify webhook metadata
  eventId           String   @unique  // X-Shopify-Event-Id (idempotency)
  topic             String
  shopifyDomain     String
  
  // Processing
  payload           Json
  processed         Boolean  @default(false)
  processedAt       DateTime?
  processingError   String?  @db.Text
  retryCount        Int      @default(0)
  
  // Verification
  hmacValid         Boolean  @default(false)
  
  // Relationships
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Timestamps
  receivedAt        DateTime @default(now())
  
  @@index([tenantId, topic, receivedAt(sort: Desc)])
  @@index([processed, receivedAt])
  @@map("webhook_events")
}

model SyncJob {
  id                String    @id @default(uuid())
  tenantId          String
  
  // Job definition
  resourceType      ResourceType
  syncMode          SyncMode  @default(INCREMENTAL)
  status            JobStatus
  
  // Progress tracking
  recordsProcessed  Int       @default(0)
  recordsFailed     Int       @default(0)
  totalRecords      Int?
  progressPercent   Int       @default(0)
  
  // Error handling
  error             String?   @db.Text
  errorStack        String?   @db.Text
  retryCount        Int       @default(0)
  
  // Timing
  startedAt         DateTime?
  completedAt       DateTime?
  durationMs        Int?
  
  // Relationships
  tenant            Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Timestamps
  createdAt         DateTime  @default(now())
  
  @@index([tenantId, status, createdAt(sort: Desc)])
  @@index([status, startedAt])
  @@map("sync_jobs")
}

enum ResourceType {
  CUSTOMERS
  ORDERS
  PRODUCTS
  CART_ABANDONMENTS
  CHECKOUTS
}

enum SyncMode {
  FULL           // Re-sync everything
  INCREMENTAL    // Only changed since last sync
  BACKFILL       // Historical data
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}
SQL Patterns You'll Use (Interview Prep):
sql-- RFM Scoring (Window Functions)
WITH customer_metrics AS (
  SELECT 
    c.id,
    c.tenant_id,
    c.total_spent,
    c.orders_count,
    EXTRACT(DAY FROM NOW() - c.last_order_date) as days_since_last_order
  FROM customers c
  WHERE c.tenant_id = $1
    AND c.last_order_date IS NOT NULL
),
rfm_scored AS (
  SELECT 
    *,
    NTILE(5) OVER (ORDER BY days_since_last_order ASC) as recency_score,
    NTILE(5) OVER (ORDER BY orders_count DESC) as frequency_score,
    NTILE(5) OVER (ORDER BY total_spent DESC) as monetary_score
  FROM customer_metrics
)
SELECT * FROM rfm_scored;

-- Customer Lifetime Value (Cohort Analysis)
SELECT 
  DATE_TRUNC('month', c.first_order_date) as cohort_month,
  COUNT(DISTINCT c.id) as customer_count,
  SUM(c.total_spent) as total_revenue,
  AVG(c.total_spent) as avg_ltv,
  AVG(c.orders_count) as avg_orders,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY c.total_spent) as p90_ltv
FROM customers c
WHERE c.tenant_id = $1
GROUP BY cohort_month
ORDER BY cohort_month DESC;

-- Churn Risk (Behavioral Segmentation)
SELECT 
  c.id,
  c.email,
  c.total_spent,
  c.orders_count,
  c.last_order_date,
  EXTRACT(DAY FROM NOW() - c.last_order_date) as days_inactive,
  CASE 
    WHEN c.orders_count >= 5 AND EXTRACT(DAY FROM NOW() - c.last_order_date) > 90 THEN 'HIGH_VALUE_CHURN_RISK'
    WHEN c.orders_count >= 5 THEN 'HIGH_VALUE_ACTIVE'
    WHEN c.orders_count <= 1 AND EXTRACT(DAY FROM NOW() - c.last_order_date) < 30 THEN 'NEW_CUSTOMER'
    ELSE 'STANDARD'
  END as risk_segment
FROM customers c
WHERE c.tenant_id = $1
ORDER BY c.total_spent DESC;

-- Revenue Trend (Time Series)
SELECT 
  DATE_TRUNC('day', o.order_date) as date,
  COUNT(*) as order_count,
  SUM(o.total_price) as revenue,
  AVG(o.total_price) as avg_order_value,
  COUNT(DISTINCT o.customer_id) as unique_customers
FROM orders o
WHERE o.tenant_id = $1
  AND o.order_date >= NOW() - INTERVAL '90 days'
  AND o.financial_status = 'PAID'
GROUP BY date
ORDER BY date DESC;
```

---

## 📦 Project Structure (Monorepo with pnpm)
```
xeno-shopify-platform/
├── apps/
│   ├── api/                          # Express.js API
│   │   ├── src/
│   │   │   ├── index.ts              # App entry point
│   │   │   ├── server.ts             # HTTP server
│   │   │   ├── config/
│   │   │   │   ├── env.ts            # Validated env vars (zod)
│   │   │   │   ├── database.ts       # Prisma client singleton
│   │   │   │   └── redis.ts          # Redis connection
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts         # JWT validation
│   │   │   │   ├── tenant.middleware.ts       # Tenant context injection
│   │   │   │   ├── rateLimit.middleware.ts    # Per-tenant rate limiting
│   │   │   │   ├── requestId.middleware.ts    # Request tracing
│   │   │   │   └── error.middleware.ts        # Global error handler
│   │   │   ├── routes/
│   │   │   │   ├── index.ts          # Route aggregator
│   │   │   │   ├── auth.routes.ts    # OAuth flow
│   │   │   │   ├── webhooks.routes.ts # Shopify webhook receiver
│   │   │   │   ├── customers.routes.ts
│   │   │   │   ├── orders.routes.ts
│   │   │   │   ├── products.routes.ts
│   │   │   │   ├── segments.routes.ts
│   │   │   │   ├── analytics.routes.ts
│   │   │   │   ├── sync.routes.ts    # Manual sync triggers
│   │   │   │   └── health.routes.ts  # Healthchecks
│   │   │   ├── services/
│   │   │   │   ├── shopify/
│   │   │   │   │   ├── client.ts     # Shopify API wrapper
│   │   │   │   │   ├── oauth.service.ts
│   │   │   │   │   ├── webhook.service.ts
│   │   │   │   │   ├── customer.service.ts
│   │   │   │   │   ├── order.service.ts
│   │   │   │   │   └── product.service.ts
│   │   │   │   ├── queue/
│   │   │   │   │   ├── queues.ts     # BullMQ queue definitions
│   │   │   │   │   ├── webhook.queue.ts
│   │   │   │   │   ├── sync.queue.ts
│   │   │   │   │   └── segment.queue.ts
│   │   │   │   ├── analytics/
│   │   │   │   │   ├── rfm.service.ts
│   │   │   │   │   ├── cohort.service.ts
│   │   │   │   │   └── churn.service.ts
│   │   │   │   ├── segment/
│   │   │   │   │   ├── builder.service.ts
│   │   │   │   │   ├── evaluator.service.ts
│   │   │   │   │   └── membership.service.ts
│   │   │   │   └── cache/
│   │   │   │       ├── cache.service.ts
│   │   │   │       └── invalidation.service.ts
│   │   │   ├── workers/
│   │   │   │   ├── index.ts          # Worker orchestrator
│   │   │   │   ├── webhook.worker.ts # Process webhooks
│   │   │   │   ├── sync.worker.ts    # Background sync
│   │   │   │   ├── segment.worker.ts # Compute segments
│   │   │   │   └── rfm.worker.ts     # Daily RFM scoring
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts         # Pino logger
│   │   │   │   ├── crypto.ts         # Encryption helpers
│   │   │   │   ├── hmac.ts           # HMAC verification
│   │   │   │   ├── pagination.ts     # Cursor pagination
│   │   │   │   └── errors.ts         # Custom error classes
│   │   │   └── types/
│   │   │       ├── express.d.ts      # Extended Request type
│   │   │       ├── shopify.types.ts
│   │   │       └── api.types.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── tests/
│   │   │   ├── integration/
│   │   │   ├── unit/
│   │   │   └── e2e/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                          # Next.js Dashboard
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/
│       │   │   │   └── page.tsx
│       │   │   └── oauth/
│       │   │       └── callback/
│       │   │           └── page.tsx
│       │   ├── dashboard/
│       │   │   ├── layout.tsx        # Dashboard shell
│       │   │   ├── page.tsx          # Overview
│       │   │   ├── customers/
│       │   │   │   ├── page.tsx      # Customer list
│       │   │   │   └── [id]/
│       │   │   │       └── page.tsx  # Customer detail
│       │   │   ├── orders/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/
│       │   │   │       └── page.tsx
│       │   │   ├── products/
│       │   │   │   └── page.tsx
│       │   │   ├── segments/
│       │   │   │   ├── page.tsx      # Segment list
│       │   │   │   ├── new/
│       │   │   │   │   └── page.tsx  # Segment builder
│       │   │   │   └── [id]/
│       │   │   │       └── page.tsx  # Segment detail
│       │   │   ├── analytics/
│       │   │   │   ├── rfm/
│       │   │   │   │   └── page.tsx
│       │   │   │   ├── cohorts/
│       │   │   │   │   └── page.tsx
│       │   │   │   └── churn/
│       │   │   │       └── page.tsx
│       │   │   └── settings/
│       │   │       └── page.tsx
│       │   ├── api/                  # Next.js API routes (if needed)
│       │   │   └── auth/
│       │   │       └── [...nextauth]/
│       │   │           └── route.ts
│       │   └── globals.css
│       ├── components/
│       │   ├── ui/                   # shadcn/ui components
│       │   ├── dashboard/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Header.tsx
│       │   │   ├── MetricCard.tsx
│       │   │   └── RevenueChart.tsx
│       │   ├── customers/
│       │   │   ├── CustomerTable.tsx
│       │   │   ├── CustomerFilters.tsx
│       │   │   └── RFMBadge.tsx
│       │   ├── segments/
│       │   │   ├── SegmentBuilder.tsx
│       │   │   ├── FilterEditor.tsx
│       │   │   └── CustomerPreview.tsx
│       │   └── analytics/
│       │       ├── RFMMatrix.tsx
│       │       ├── CohortTable.tsx
│       │       └── ChurnChart.tsx
│       ├── lib/
│       │   ├── api-client.ts         # Axios instance
│       │   ├── auth.ts               # NextAuth config
│       │   ├── react-query.ts        # Query client
│       │   └── utils.ts
│       ├── hooks/
│       │   ├── useCustomers.ts
│       │   ├── useOrders.ts
│       │   ├── useSegments.ts
│       │   └── useAnalytics.ts
│       ├── types/
│       │   └── api.types.ts
│       ├── public/
│       ├── package.json
│       ├── next.config.js
│       └── tsconfig.json
│
├── packages/                         # Shared packages (optional)
│   └── types/                        # Shared TypeScript types
│       ├── src/
│       │   ├── tenant.types.ts
│       │   ├── customer.types.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── .github/
│   └── workflows/
│       ├── api-deploy.yml
│       └── web-deploy.yml
│
├── docs/
│   ├── ARCHITECTURE.md               # 2-3 page technical doc
│   ├── API.md                        # API documentation
│   ├── DATABASE.md                   # Schema + SQL examples
│   ├── DEPLOYMENT.md                 # Deployment guide
│   └── DEMO_SCRIPT.md                # Video script
│
├── .env.example
├── .gitignore
├── pnpm-workspace.yaml
├── package.json                      # Root package
├── tsconfig.base.json
└── README.md

🚀 Phase-by-Phase Implementation (12 Days)
Phase 1: Foundation (Days 1-3) - "Infrastructure First"
Goal: Cloud DB, OAuth, basic sync working
Day 1 Morning: Project Scaffolding + Cloud DB
bash# Initialize monorepo
mkdir xeno-shopify-platform && cd xeno-shopify-platform
pnpm init
pnpm add -D typescript @types/node tsx

# Create workspace structure
mkdir -p apps/api/src apps/web packages/types
touch pnpm-workspace.yaml

# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
Setup Railway Database (15 minutes):

Go to railway.app → Create project
"New" → "Provision PostgreSQL"
Copy DATABASE_URL from "Variables" tab
Add to .env in root

bash# .env (root)
DATABASE_URL="postgresql://postgres:..."
NODE_ENV="development"

SHOPIFY_API_KEY=""
SHOPIFY_API_SECRET=""
SHOPIFY_SCOPES="read_customers,read_orders,read_products,read_checkouts,write_webhooks"
HOST="http://localhost:3001"

REDIS_URL="redis://default:...@upstash.io:6379"

JWT_SECRET="generate-random-256-bit-key"
ENCRYPTION_KEY="generate-random-256-bit-key"
Initialize Prisma:
bashcd apps/api
pnpm add -D prisma
pnpm add @prisma/client
npx prisma init --datasource-provider postgresql

# Copy the comprehensive schema from above
# Then:
npx prisma migrate dev --name init
npx prisma generate
Verify Connection:
bashnpx prisma studio
# Should open browser showing empty tables
✅ Checkpoint: Railway DB connected, schema migrated
📹 Clip #1 (1 min): Show Prisma Studio with tables

Day 1 Afternoon: Express API Skeleton
typescript// apps/api/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string(),
  HOST: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
});

export const env = envSchema.parse(process.env);
typescript// apps/api/src/config/database.ts
import { PrismaClient } from '@prisma/client';
import { env } from './env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
typescript// apps/api/src/utils/logger.ts
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
typescript// apps/api/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error({
    err,
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers,
    },
  }, 'Error caught by global handler');

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Resource already exists',
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Resource not found',
      });
    }
  }

  // App errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Unknown errors
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
typescript// apps/api/src/server.ts
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

export function createServer(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: env.NODE_ENV === 'production' 
      ? ['https://your-vercel-app.vercel.app']
      : ['http://localhost:3000'],
    credentials: true,
  }));

  // Logging
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Routes will be added here

  // Error handling
  app.use(errorHandler);

  return app;
}
typescript// apps/api/src/index.ts
import { createServer } from './server';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';

const app = createServer();

const PORT = parseInt(env.PORT, 10);

async function main() {
  // Verify DB connection
  await prisma.$connect();
  logger.info('Database connected');

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });
}

main().catch((error) => {
  logger.error(error, 'Failed to start server');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
Test:
bashcd apps/api
pnpm add express cors helmet morgan
pnpm add -D @types/express @types/cors @types/morgan
pnpm add pino pino-pretty zod

pnpm tsx src/index.ts
curl http://localhost:3001/health
✅ Checkpoint: API responding to requests

Day 2 Morning: Shopify OAuth Flow
Create Shopify App:

partners.shopify.com → Apps → Create App → "Create app manually"
App name: "Xeno Analytics"
App URL: https://your-ngrok-url.ngrok-free.app
Allowed redirection URL: https://your-ngrok-url.ngrok-free.app/auth/callback
Scopes: read_customers, read_orders, read_products, read_checkouts, write_webhooks
Copy API key + secret

Create Development Store:

partners.shopify.com → Stores → Add store
Development store → Create
Add 50+ dummy products (use Shopify's sample data)
Add 100+ customers with orders

typescript// apps/api/src/services/shopify/client.ts
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { env } from '../../config/env';

export const shopify = shopifyApi({
  apiKey: env.SHOPIFY_API_KEY,
  apiSecretKey: env.SHOPIFY_API_SECRET,
  scopes: env.SHOPIFY_SCOPES.split(','),
  hostName: env.HOST.replace(/https?:\/\//, ''),
  hostScheme: env.HOST.startsWith('https') ? 'https' : 'http',
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
  isPrivateApp: false,
});
typescript// apps/api/src/utils/crypto.ts
import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
typescript// apps/api/src/routes/auth.routes.ts
import { Router } from 'express';
import { shopify } from '../services/shopify/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { encrypt, hash } from '../utils/crypto';

const router = Router();

// Step 1: Initiate OAuth
router.get('/install', async (req, res, next) => {
  try {
    const { shop } = req.query;

    if (!shop || typeof shop !== 'string') {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    logger.info({ shop }, 'Initiating OAuth');

    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true)!,
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    next(error);
  }
});

// Step 2: Handle callback
router.get('/callback', async (req, res, next) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;

    logger.info({
      shop: session.shop,
      scope: session.scope,
    }, 'OAuth successful');

    // Encrypt access token
    const encryptedToken = encrypt(session.accessToken!);
    const tokenHash = hash(session.accessToken!);

    // Fetch shop info
    const client = new shopify.clients.Rest({ session });
    const shopInfo = await client.get({ path: 'shop' });
    const shop = shopInfo.body.shop as any;

    // Upsert tenant
    const tenant = await prisma.tenant.upsert({
      where: { shopifyDomain: session.RetryTContinueOrchestrated continuation of multi-day implementation roadmap.The user wants me to continue the roadmap. I'm in the middle of the OAuth implementation on Day 2. Let me continue from where I left off.
I need to complete:

OAuth callback handler
Webhook registration
Continue through Day 2 afternoon (Shopify API wrapper)
Day 3 (Initial sync)
Day 4-12 (remaining phases)

Let me continue the OAuth callback implementation and then proceed through the rest of the roadmap.shop },
update: {
accessToken: encryptedToken,
accessTokenHash: tokenHash,
shopName: shop.name,
email: shop.email,
scope: session.scope.split(','),
status: 'ACTIVE',
lastSyncAt: null,
},
create: {
shopifyDomain: session.shop,
accessToken: encryptedToken,
accessTokenHash: tokenHash,
shopName: shop.name,
email: shop.email,
scope: session.scope.split(','),
status: 'ACTIVE',
planTier: 'FREE',
},
});
logger.info({ tenantId: tenant.id }, 'Tenant created/updated');

// Register webhooks
await registerWebhooks(tenant.id, session);

// Redirect to frontend
const redirectUrl = process.env.NODE_ENV === 'production'
  ? `https://your-vercel-app.vercel.app/dashboard?tenantId=${tenant.id}`
  : `http://localhost:3000/dashboard?tenantId=${tenant.id}`;

res.redirect(redirectUrl);
} catch (error) {
logger.error(error, 'OAuth callback failed');
next(error);
}
});
async function registerWebhooks(tenantId: string, session: any) {
const client = new shopify.clients.Rest({ session });
const topics = [
'customers/create',
'customers/update',
'orders/create',
'orders/updated',
'products/create',
'products/update',
'carts/create',
'carts/update',
];
const baseUrl = process.env.HOST;
for (const topic of topics) {
try {
await client.post({
path: 'webhooks',
data: {
webhook: {
topic,
address: ${baseUrl}/webhooks/shopify,
format: 'json',
},
},
});
  logger.info({ topic, tenantId }, 'Webhook registered');
} catch (error: any) {
  // Ignore if webhook already exists
  if (!error.message?.includes('already exists')) {
    logger.error({ topic, error }, 'Webhook registration failed');
  }
}
}
}
export default router;

**Update server.ts to include auth routes**:
```typescript
// In apps/api/src/server.ts, add after health check:
import authRoutes from './routes/auth.routes';

app.use('/auth', authRoutes);
```

**Test with ngrok**:
```bash
# Terminal 1
cd apps/api
pnpm tsx src/index.ts

# Terminal 2
ngrok http 3001
# Copy the https URL

# Update .env:
HOST="https://abc123.ngrok-free.app"

# Restart API
# Then visit: https://abc123.ngrok-free.app/auth/install?shop=your-store.myshopify.com
```

**✅ Checkpoint**: OAuth completes, tenant created, webhooks registered
**📹 Clip #2 (2 min)**: Show OAuth flow, tenant in Prisma Studio, webhooks in Shopify admin

---

#### **Day 2 Afternoon: Shopify API Wrapper**
```typescript
// apps/api/src/services/shopify/customer.service.ts
import { shopify } from './client';
import { logger } from '../../utils/logger';
import { decrypt } from '../../utils/crypto';

export class ShopifyCustomerService {
  private session: any;

  constructor(shop: string, encryptedAccessToken: string) {
    this.session = {
      shop,
      accessToken: decrypt(encryptedAccessToken),
      state: 'offline',
      isOnline: false,
    };
  }

  async fetchAll() {
    const client = new shopify.clients.Rest({ session: this.session });
    const customers: any[] = [];
    let pageInfo: string | null = null;

    try {
      while (true) {
        const params: any = { limit: 250 };
        if (pageInfo) params.page_info = pageInfo;

        const response = await client.get({
          path: 'customers',
          query: params,
        });

        const batch = response.body.customers as any[];
        customers.push(...batch);

        logger.debug(`Fetched ${batch.length} customers`);

        if (batch.length < 250) break;

        // Extract next page info from Link header
        const linkHeader = response.headers.get('link');
        pageInfo = this.extractPageInfo(linkHeader, 'next');
        
        if (!pageInfo) break;

        // Rate limiting: Shopify allows 2 requests/second
        await this.sleep(500);
      }

      return customers;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch customers');
      throw error;
    }
  }

  async fetchById(customerId: string) {
    const client = new shopify.clients.Rest({ session: this.session });
    
    const response = await client.get({
      path: `customers/${customerId}`,
    });

    return response.body.customer;
  }

  async fetchSince(sinceId: string) {
    const client = new shopify.clients.Rest({ session: this.session });
    
    const response = await client.get({
      path: 'customers',
      query: { since_id: sinceId, limit: 250 },
    });

    return response.body.customers;
  }

  private extractPageInfo(linkHeader: string | null, direction: 'next' | 'previous'): string | null {
    if (!linkHeader) return null;

    const regex = direction === 'next'
      ? /page_info=([^>]+)>; rel="next"/
      : /page_info=([^>]+)>; rel="previous"/;

    const match = linkHeader.match(regex);
    return match ? match[1] : null;
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```
```typescript
// apps/api/src/services/shopify/order.service.ts
import { shopify } from './client';
import { decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';

export class ShopifyOrderService {
  private session: any;

  constructor(shop: string, encryptedAccessToken: string) {
    this.session = {
      shop,
      accessToken: decrypt(encryptedAccessToken),
      state: 'offline',
      isOnline: false,
    };
  }

  async fetchAll(options?: { since?: string; status?: string }) {
    const client = new shopify.clients.Rest({ session: this.session });
    const orders: any[] = [];
    let pageInfo: string | null = null;

    const baseQuery: any = {
      status: options?.status || 'any',
      limit: 250,
    };

    if (options?.since) {
      baseQuery.created_at_min = options.since;
    }

    while (true) {
      const query = pageInfo
        ? { ...baseQuery, page_info: pageInfo }
        : baseQuery;

      const response = await client.get({
        path: 'orders',
        query,
      });

      const batch = response.body.orders as any[];
      orders.push(...batch);

      logger.debug(`Fetched ${batch.length} orders`);

      if (batch.length < 250) break;

      const linkHeader = response.headers.get('link');
      pageInfo = this.extractPageInfo(linkHeader, 'next');

      if (!pageInfo) break;

      await this.sleep(500);
    }

    return orders;
  }

  private extractPageInfo(linkHeader: string | null, direction: 'next' | 'previous'): string | null {
    if (!linkHeader) return null;
    const regex = direction === 'next'
      ? /page_info=([^>]+)>; rel="next"/
      : /page_info=([^>]+)>; rel="previous"/;
    const match = linkHeader.match(regex);
    return match ? match[1] : null;
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```
```typescript
// apps/api/src/services/shopify/product.service.ts
import { shopify } from './client';
import { decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';

export class ShopifyProductService {
  private session: any;

  constructor(shop: string, encryptedAccessToken: string) {
    this.session = {
      shop,
      accessToken: decrypt(encryptedAccessToken),
      state: 'offline',
      isOnline: false,
    };
  }

  async fetchAll() {
    const client = new shopify.clients.Rest({ session: this.session });
    const products: any[] = [];
    let pageInfo: string | null = null;

    while (true) {
      const query: any = { limit: 250 };
      if (pageInfo) query.page_info = pageInfo;

      const response = await client.get({
        path: 'products',
        query,
      });

      const batch = response.body.products as any[];
      products.push(...batch);

      logger.debug(`Fetched ${batch.length} products`);

      if (batch.length < 250) break;

      const linkHeader = response.headers.get('link');
      pageInfo = this.extractPageInfo(linkHeader, 'next');

      if (!pageInfo) break;

      await this.sleep(500);
    }

    return products;
  }

  private extractPageInfo(linkHeader: string | null, direction: 'next' | 'previous'): string | null {
    if (!linkHeader) return null;
    const regex = direction === 'next'
      ? /page_info=([^>]+)>; rel="next"/
      : /page_info=([^>]+)>; rel="previous"/;
    const match = linkHeader.match(regex);
    return match ? match[1] : null;
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**✅ Checkpoint**: Shopify API wrappers ready

---

#### **Day 3 Morning: BullMQ Setup + Initial Data Sync**

**Setup Upstash Redis**:
1. Go to upstash.com → Create account
2. Create Redis database → "Global" region
3. Copy `REDIS_URL` to `.env`
```typescript
// apps/api/src/config/redis.ts
import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error({ error }, 'Redis error');
});
```
```typescript
// apps/api/src/services/queue/queues.ts
import { Queue } from 'bullmq';
import { redis } from '../../config/redis';

const connection = redis;

export const syncQueue = new Queue('sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 100,
      age: 3600,
    },
    removeOnFail: {
      count: 1000,
    },
  },
});

export const webhookQueue = new Queue('webhooks', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 500,
      age: 7200,
    },
  },
});

export const segmentQueue = new Queue('segments', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
  },
});
```
```typescript
// apps/api/src/workers/sync.worker.ts
import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { ShopifyCustomerService } from '../services/shopify/customer.service';
import { ShopifyOrderService } from '../services/shopify/order.service';
import { ShopifyProductService } from '../services/shopify/product.service';

interface SyncJobData {
  tenantId: string;
  resourceType: 'customers' | 'orders' | 'products';
  syncMode: 'full' | 'incremental';
}

export const syncWorker = new Worker<SyncJobData>(
  'sync',
  async (job: Job<SyncJobData>) => {
    const { tenantId, resourceType, syncMode } = job.data;

    logger.info({ tenantId, resourceType, syncMode }, 'Starting sync job');

    // Create sync job record
    const syncJob = await prisma.syncJob.create({
      data: {
        tenantId,
        resourceType: resourceType.toUpperCase() as any,
        syncMode: syncMode.toUpperCase() as any,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      let recordsProcessed = 0;

      switch (resourceType) {
        case 'customers':
          recordsProcessed = await syncCustomers(tenant, job);
          break;
        case 'orders':
          recordsProcessed = await syncOrders(tenant, job);
          break;
        case 'products':
          recordsProcessed = await syncProducts(tenant, job);
          break;
      }

      // Update sync job
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'COMPLETED',
          recordsProcessed,
          completedAt: new Date(),
          durationMs: Date.now() - syncJob.startedAt!.getTime(),
        },
      });

      // Update tenant last sync
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { lastSyncAt: new Date() },
      });

      logger.info({
        tenantId,
        resourceType,
        recordsProcessed,
      }, 'Sync completed');

      return { success: true, recordsProcessed };
    } catch (error: any) {
      logger.error({ error, tenantId, resourceType }, 'Sync failed');

      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: 'FAILED',
          error: error.message,
          errorStack: error.stack,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2, // Process 2 sync jobs at a time
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute
    },
  }
);

async function syncCustomers(tenant: any, job: Job) {
  const service = new ShopifyCustomerService(tenant.shopifyDomain, tenant.accessToken);
  const customers = await service.fetchAll();

  let processed = 0;

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: {
        tenantId_shopifyId: {
          tenantId: tenant.id,
          shopifyId: customer.id.toString(),
        },
      },
      update: {
        email: customer.email,
        phone: customer.phone,
        firstName: customer.first_name,
        lastName: customer.last_name,
        shopifyCreatedAt: new Date(customer.created_at),
        updatedAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        shopifyId: customer.id.toString(),
        email: customer.email,
        phone: customer.phone,
        firstName: customer.first_name,
        lastName: customer.last_name,
        shopifyCreatedAt: new Date(customer.created_at),
      },
    });

    processed++;

    // Update progress
    if (processed % 50 === 0) {
      await job.updateProgress({
        processed,
        total: customers.length,
        percent: Math.round((processed / customers.length) * 100),
      });
    }
  }

  return processed;
}

async function syncOrders(tenant: any, job: Job) {
  const service = new ShopifyOrderService(tenant.shopifyDomain, tenant.accessToken);
  
  // Fetch last 6 months of orders
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const orders = await service.fetchAll({
    since: sixMonthsAgo.toISOString(),
    status: 'any',
  });

  let processed = 0;

  for (const order of orders) {
    // Find customer
    let customer = null;
    if (order.customer) {
      customer = await prisma.customer.findFirst({
        where: {
          tenantId: tenant.id,
          shopifyId: order.customer.id.toString(),
        },
      });
    }

    const orderDate = new Date(order.created_at);

    await prisma.order.upsert({
      where: {
        tenantId_shopifyId: {
          tenantId: tenant.id,
          shopifyId: order.id.toString(),
        },
      },
      update: {
        customerId: customer?.id,
        orderNumber: order.order_number,
        orderName: order.name,
        totalPrice: order.total_price,
        subtotalPrice: order.subtotal_price,
        totalTax: order.total_tax,
        totalDiscounts: order.total_discounts,
        financialStatus: order.financial_status.toUpperCase(),
        fulfillmentStatus: order.fulfillment_status?.toUpperCase(),
        lineItems: order.line_items,
        lineItemsCount: order.line_items.length,
        currency: order.currency,
        orderDate,
        orderMonth: orderDate.toISOString().substring(0, 7), // YYYY-MM
        cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
        shopifyUpdatedAt: new Date(order.updated_at),
      },
      create: {
        tenantId: tenant.id,
        shopifyId: order.id.toString(),
        customerId: customer?.id,
        orderNumber: order.order_number,
        orderName: order.name,
        totalPrice: order.total_price,
        subtotalPrice: order.subtotal_price,
        totalTax: order.total_tax,
        totalDiscounts: order.total_discounts,
        financialStatus: order.financial_status.toUpperCase(),
        fulfillmentStatus: order.fulfillment_status?.toUpperCase(),
        lineItems: order.line_items,
        lineItemsCount: order.line_items.length,
        currency: order.currency,
        orderDate,
        orderMonth: orderDate.toISOString().substring(0, 7),
        cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
        shopifyCreatedAt: orderDate,
        shopifyUpdatedAt: new Date(order.updated_at),
      },
    });

    // Update customer aggregates
    if (customer) {
      await updateCustomerAggregates(customer.id);
    }

    processed++;

    if (processed % 25 === 0) {
      await job.updateProgress({
        processed,
        total: orders.length,
        percent: Math.round((processed / orders.length) * 100),
      });
    }
  }

  return processed;
}

async function syncProducts(tenant: any, job: Job) {
  const service = new ShopifyProductService(tenant.shopifyDomain, tenant.accessToken);
  const products = await service.fetchAll();

  let processed = 0;

  for (const product of products) {
    const firstVariant = product.variants?.[0];

    await prisma.product.upsert({
      where: {
        tenantId_shopifyId: {
          tenantId: tenant.id,
          shopifyId: product.id.toString(),
        },
      },
      update: {
        title: product.title,
        description: product.body_html,
        vendor: product.vendor,
        productType: product.product_type,
        status: product.status.toUpperCase(),
        price: firstVariant?.price,
        compareAtPrice: firstVariant?.compare_at_price,
        variants: product.variants,
        variantCount: product.variants.length,
        images: product.images,
        featuredImage: product.image?.src,
        shopifyUpdatedAt: new Date(product.updated_at),
      },
      create: {
        tenantId: tenant.id,
        shopifyId: product.id.toString(),
        title: product.title,
        description: product.body_html,
        vendor: product.vendor,
        productType: product.product_type,
        status: product.status.toUpperCase(),
        price: firstVariant?.price,
        compareAtPrice: firstVariant?.compare_at_price,
        variants: product.variants,
        variantCount: product.variants.length,
        images: product.images,
        featuredImage: product.image?.src,
        shopifyCreatedAt: new Date(product.created_at),
        shopifyUpdatedAt: new Date(product.updated_at),
      },
    });

    processed++;
  }

  return processed;
}

async function updateCustomerAggregates(customerId: string) {
  const aggregates = await prisma.order.aggregate({
    where: {
      customerId,
      financialStatus: 'PAID',
    },
    _count: true,
    _sum: {
      totalPrice: true,
    },
    _max: {
      orderDate: true,
    },
    _min: {
      orderDate: true,
    },
  });

  const avgOrderValue = aggregates._count > 0
    ? Number(aggregates._sum.totalPrice) / aggregates._count
    : 0;

  const daysSinceLastOrder = aggregates._max.orderDate
    ? Math.floor((Date.now() - aggregates._max.orderDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalSpent: aggregates._sum.totalPrice || 0,
      ordersCount: aggregates._count,
      avgOrderValue,
      lastOrderDate: aggregates._max.orderDate,
      firstOrderDate: aggregates._min.orderDate,
      daysSinceLastOrder,
      isChurnRisk: daysSinceLastOrder !== null && daysSinceLastOrder > 90,
    },
  });
}

syncWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Sync job completed');
});

syncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Sync job failed');
});
```
```typescript
// apps/api/src/routes/sync.routes.ts
import { Router } from 'express';
import { syncQueue } from '../services/queue/queues';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';

const router = Router();

// Trigger full sync
router.post('/trigger/:tenantId', async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError(404, 'Tenant not found');
    }

    // Enqueue sync jobs
    const jobs = await Promise.all([
      syncQueue.add('sync-customers', {
        tenantId,
        resourceType: 'customers',
        syncMode: 'full',
      }),
      syncQueue.add('sync-orders', {
        tenantId,
        resourceType: 'orders',
        syncMode: 'full',
      }),
      syncQueue.add('sync-products', {
        tenantId,
        resourceType: 'products',
        syncMode: 'full',
      }),
    ]);

    res.json({
      message: 'Sync jobs enqueued',
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get sync status
router.get('/status/:tenantId', async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const jobs = await prisma.syncJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({ jobs });
  } catch (error) {
    next(error);
  }
});

export default router;
```

**Update server.ts**:
```typescript
import syncRoutes from './routes/sync.routes';

app.use('/sync', syncRoutes);
```

**Start worker**:
```typescript
// apps/api/src/index.ts - add before starting server
import './workers/sync.worker';
```

**Test sync**:
```bash
curl -X POST http://localhost:3001/sync/trigger/{tenant-id}

# Check status
curl http://localhost:3001/sync/status/{tenant-id}

# Watch Prisma Studio - data should be populating
```

**✅ Checkpoint**: Initial sync working, data in database
**📹 Clip #3 (2 min)**: Trigger sync, show progress, show populated tables

---

#### **Day 3 Afternoon: Deploy to Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init

# Link to existing Postgres
railway link

# Add environment variables in Railway dashboard:
# SHOPIFY_API_KEY, SHOPIFY_API_SECRET, HOST, JWT_SECRET, ENCRYPTION_KEY, REDIS_URL

# Create Procfile
echo "web: node dist/index.js" > Procfile

# Build step
npm run build

# Deploy
railway up
```

**Add to package.json**:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

**Test deployment**:
```bash
curl https://your-app.railway.app/health
```

**✅ Checkpoint**: API deployed and accessible
**📹 Clip #4 (1 min)**: Show Railway dashboard, API responding

---

### **Phase 2: Real-time Processing (Days 4-6) - "Webhooks + Workers"**

#### **Day 4 Morning: Webhook Receiver + HMAC Verification**
```typescript
// apps/api/src/utils/hmac.ts
import crypto from 'crypto';
import { env } from '../config/env';

export function verifyShopifyHmac(body: Buffer, hmacHeader: string): boolean {
  const computedHmac = crypto
    .createHmac('sha256', env.SHOPIFY_API_SECRET)
    .update(body)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(hmacHeader),
    Buffer.from(computedHmac)
  );
}
```
```typescript
// apps/api/src/routes/webhooks.routes.ts
import { Router } from 'express';
import express from 'express';
import { prisma } from '../config/database';
import { webhookQueue } from '../services/queue/queues';
import { verifyShopifyHmac } from '../utils/hmac';
import { logger } from '../utils/logger';

const router = Router();

// CRITICAL: Use raw body for HMAC verification
router.post(
  '/shopify',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      // Extract headers
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const shop = req.headers['x-shopify-shop-domain'] as string;
      const eventId = req.headers['x-shopify-webhook-id'] as string;

      logger.info({ topic, shop, eventId }, 'Webhook received');

      // Verify HMAC
      const body = req.body as Buffer;
      const isValid = verifyShopifyHmac(body, hmac);

      if (!isValid) {
        logger.warn({ shop, topic }, 'Invalid HMAC signature');
        return res.status(401).send('Unauthorized');
      }

      // Find tenant
      const tenant = await prisma.tenant.findUnique({
        where: { shopifyDomain: shop },
      });

      if (!tenant) {
        logger.error({ shop }, 'Tenant not found');
        return res.status(404).send('Not Found');
      }

      // Parse payload
      const payload = JSON.parse(body.toString('utf-8'));

      // Check for duplicate
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId },
      });

      if (existing) {
        logger.info({ eventId }, 'Duplicate webhook, ignoring');
        return res.status(200).send('OK');
      }

      // Store webhook event
      await prisma.webhookEvent.create({
        data: {
          tenantId: tenant.id,
          eventId,
          topic,
          shopifyDomain: shop,
          payload,
          hmacValid: true,
          processed: false,
        },
      });

      // Enqueue for processing
      await webhookQueue.add(
        'process-webhook',
        {
          tenantId: tenant.id,
          topic,
          payload,
          eventId,
        },
        {
          jobId: eventId, // Prevents duplicate jobs
        }
      );

      logger.info({ eventId, topic }, 'Webhook enqueued');

      // Respond immediately (Shopify requires <5s)
      res.status(200).send('OK');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Webhook processing error');
      res.status(500).send('Error');
    }
  }
);

export default router;
```

**Update server.ts**:
```typescript
import webhookRoutes from './routes/webhooks.routes';

app.use('/webhooks', webhookRoutes);
```

**✅ Checkpoint**: Webhook endpoint ready, HMAC verification working

---

#### **Day 4 Afternoon: Webhook Worker**
```typescript
// apps/api/src/workers/webhook.worker.ts
import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface WebhookJobData {
  tenantId: string;
  topic: string;
  payload: any;
  eventId: string;
}

export const webhookWorker = new Worker<WebhookJobData>(
  'webhooks',
  async (job: Job<WebhookJobData>) => {
    const { tenantId, topic, payload, eventId } = job.data;

    logger.info({ eventId, topic }, 'Processing webhook');

    try {
      // Process based on topic
      switch (topic) {
        case 'customers/create':
        case 'customers/update':
          await handleCustomerWebhook(tenantId, payload);
          break;

        case 'orders/create':
        case 'orders/updated':
          await handleOrderWebhook(tenantId, payload);
          break;

        case 'products/create':
        case 'products/update':
          await handleProductWebhook(tenantId, payload);
          break;

        case 'carts/create':
        case 'carts/update':
          await handleCartWebhook(tenantId, payload);
          break;

        default:
          logger.warn({ topic }, 'Unknown webhook topic');
      }

      // Mark as processed
      await prisma.webhookEvent.update({
        where: { eventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      logger.info({ eventId, topic }, 'Webhook processed');

      return { success: true };
    } catch (error: any) {
      logger.error({ eventId, error: error.message }, 'Webhook processing failed');

      await prisma.webhookEvent.update({
        where: { eventId },
        data: {
          processingError: error.message,
          retryCount: { increment: 1 },
        },
      });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 webhooks concurrently
    limiter: {
      max: 20,
      duration: 1000, // 20 webhooks per second
    },
  }
);

async function handleCustomerWebhook(tenantId: string, payload: any) {
  const customer = payload;

  await prisma.customer.upsert({
    where: {
      tenantId_shopifyId: {
        tenantId,
        shopifyId: customer.id.toString(),
      },
    },
    update: {
      email: customer.email,
      phone: customer.phone,
      firstName: customer.first_name,
      lastName: customer.last_name,
      shopifyCreatedAt: new Date(customer.created_at),
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      shopifyId: customer.id.toString(),
      email: customer.email,
      phone: customer.phone,
      firstName: customer.first_name,
      lastName: customer.last_name,
      shopifyCreatedAt: new Date(customer.created_at),
    },
  });
}

async function handleOrderWebhook(tenantId: string, payload: any) {
  const order = payload;

  // Find or create customer
  let customer = null;
  if (order.customer) {
    customer = await prisma.customer.upsert({
      where: {
        tenantId_shopifyId: {
          tenantId,
          shopifyId: order.customer.id.toString(),
        },
      },
      update: {
        email: order.customer.email,
        firstName: order.customer.first_name,
        lastName: order.customer.last_name,
      },
      create: {
        tenantId,
        shopifyId: order.customer.id.toString(),
        email: order.customer.email,
        firstName: order.customer.first_name,
        lastName: order.customer.last_name,
        shopifyCreatedAt: new Date(order.customer.created_at),
      },
    });
  }

  const orderDate = new Date(order.created_at);

  // Upsert order
  await prisma.order.upsert({
    where: {
      tenantId_shopifyId: {
        tenantId,
        shopifyId: order.id.toString(),
      },
    },
    update: {
      customerId: customer?.id,
      orderNumber: order.order_number,
      orderName: order.name,
      totalPrice: order.total_price,
      subtotalPrice: order.subtotal_price,
      totalTax: order.total_tax,
      totalDiscounts: order.total_discounts,
      financialStatus: order.financial_status.toUpperCase(),
      fulfillmentStatus: order.fulfillment_status?.toUpperCase(),
      lineItems: order.line_items,
      lineItemsCount: order.line_items.length,
      currency: order.currency,
      orderDate,
      orderMonth: orderDate.toISOString().substring(0, 7),
      cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
      shopifyUpdatedAt: new Date(order.updated_at),
    },
    create: {
      tenantId,
      shopifyId: order.id.toString(),
      customerId: customer?.id,
      orderNumber: order.order_number,
      orderName: order.name,
      totalPrice: order.total_price,
      subtotalPrice: order.subtotal_price,
      totalTax: order.total_tax,
      totalDiscounts: order.total_discounts,
      financialStatus: order.financial_status.toUpperCase(),
      fulfillmentStatus: order.fulfillment_status?.toUpperCase(),
      lineItems: order.line_items,
      lineItemsCount: order.line_items.length,
      currency: order.currency,
      orderDate,
      orderMonth: orderDate.toISOString().substring(0, 7),
      cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
      shopifyCreatedAt: orderDate,
      shopifyUpdatedAt: new Date(order.updated_at),
    },
  });

  // Update customer aggregates
  if (customer && order.financial_status === 'paid') {
    await updateCustomerAggregates(customer.id);
    
    // Invalidate cache
    await redis.del(`customer:${customer.id}`);
    await redis.del(`dashboard:metrics:${tenantId}`);
  }
}

async function handleProductWebhook(tenantId: string, payload: any) {
  const product = payload;
  const firstVariant = product.variants?.[0];

  await prisma.product.upsert({
    where: {
      tenantId_shopifyId: {
        tenantId,
        shopifyId: product.id.toString(),
      },
    },
    update: {
      title: product.title,
      description: product.body_html,
      vendor: product.vendor,
      productType: product.product_type,
      status: product.status.toUpperCase(),
      price: firstVariant?.price,
      compareAtPrice: firstVariant?.compare_at_price,
      variants: product.variants,
      variantCount: product.variants.length,
      images: product.images,
      featuredImage: product.image?.src,
      shopifyUpdatedAt: new Date(product.updated_at),
    },
    create: {
      tenantId,
      shopifyId: product.id.toString(),
      title: product.title,
      description: product.body_html,
      vendor: product.vendor,
      productType: product.product_type,
      status: product.status.toUpperCase(),
      price: firstVariant?.price,
      compareAtPrice: firstVariant?.compare_at_price,
      variants: product.variants,
      variantCount: product.variants.length,
      images: product.images,
      featuredImage: product.image?.src,
      shopifyCreatedAt: new Date(product.created_at),
      shopifyUpdatedAt: new Date(product.updated_at),
    },
  });
}

async function handleCartWebhook(tenantId: string, payload: any) {
  const cart = payload;

  // Only track abandoned carts (no completed_at)
  if (!cart.completed_at && cart.line_items?.length > 0) {
    await prisma.event.create({
      data: {
        tenantId,
        eventType: 'CART_ABANDONED',
        eventSource: 'WEBHOOK',
        payload: cart,
        value: parseFloat(cart.total_price || '0'),
        occurredAt: new Date(cart.updated_at),
      },
    });
  }
}

async function updateCustomerAggregates(customerId: string) {
  const aggregates = await prisma.order.aggregate({
    where: {
      customerId,
      financialStatus: 'PAID',
    },
    _count: true,
    _sum: {
      totalPrice: true,
    },
    _max: {
      orderDate: true,
    },
    _min: {
      orderDate: true,
    },
  });

  const avgOrderValue = aggregates._count > 0
    ? Number(aggregates._sum.totalPrice) / aggregates._count
    : 0;

  const daysSinceLastOrder = aggregates._max.orderDate
    ? Math.floor((Date.now() - aggregates._max.orderDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Calculate high value threshold (P90)
  const p90Result = await prisma.$queryRaw<[{ p90: number }]>`
    SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_spent) as p90
    FROM customers
    WHERE tenant_id = (SELECT tenant_id FROM customers WHERE id = ${customerId}::uuid)
  `;
  
  const p90Threshold = p90Result[0]?.p90 || 1000;

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalSpent: aggregates._sum.totalPrice || 0,
      ordersCount: aggregates._count,
      avgOrderValue,
      lastOrderDate: aggregates._max.orderDate,
      firstOrderDate: aggregates._min.orderDate,
      daysSinceLastOrder,
      isChurnRisk: daysSinceLastOrder !== null && daysSinceLastOrder > 90,
      isHighValue: Number(aggregates._sum.totalPrice || 0) >= p90Threshold,
    },
  });
}

webhookWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Webhook job completed');
});

webhookWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Webhook job failed');
});
```

**Start webhook worker**:
```typescript
// apps/api/src/index.ts - add after sync worker
import './workers/webhook.worker';
```

**Test with Shopify CLI**:
```bash
shopify webhook trigger --topic orders/create \
  --api-version 2025-01 \
  --delivery-method http \
  --address https://your-railway-app.railway.app/webhooks/shopify
```

**✅ Checkpoint**: Webhooks being processed in real-time
**📹 Clip #5 (2 min)**: Trigger webhook, show it in queue, show processed data

---

#### **Day 5-6: Dashboard API Endpoints**
```typescript
// apps/api/src/middleware/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';
import { prisma } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenant?: any;
    }
  }
}

export async function extractTenant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      throw new AppError(401, 'Missing X-Tenant-Id header');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new AppError(404, 'Tenant not found');
    }

    if (tenant.status !== 'ACTIVE') {
      throw new AppError(403, 'Tenant is not active');
    }

    req.tenantId = tenantId;
    req.tenant = tenant;

    next();
  } catch (error) {
    next(error);
  }
}
```
```typescript
// apps/api/src/services/cache/cache.service.ts
import { redis } from '../../config/redis';
import { logger } from '../../utils/logger';

export class CacheService {
  static async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (!cached) return null;
      
      return JSON.parse(cached) as T;
    } catch (error) {
      logger.error({ key, error }, 'Cache get error');
      return null;
    }
  }

  static async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.error({ key, error }, 'Cache set error');
    }
  }

  static async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error({ key, error }, 'Cache delete error');
    }
  }

  static async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error({ pattern, error }, 'Cache invalidate error');
    }
  }
}
```
```typescript
// apps/api/src/routes/analytics.routes.ts
import { Router } from 'express';
import { prisma } from '../config/database';
import { extractTenant } from '../middleware/tenant.middleware';
import { CacheService } from '../services/cache/cache.service';

const router = Router();

router.use(extractTenant);

// Dashboard overview
router.get('/overview', async (req, res, next) => {
  try {
    const { tenantId } = req;
    const cacheKey = `dashboard:metrics:${tenantId}`;

    // Try cache first
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const [
      totalCustomers,
      totalOrders,
      revenueAgg,
      avgOrderValueAgg,
      highValueCustomers,
    ] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.order.count({ where: { tenantId, financialStatus: 'PAID' } }),
      prisma.order.aggregate({
        where: { tenantId, financialStatus: 'PAID' },
        _sum: { totalPrice: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, financialStatus: 'PAID' },
        _avg: { totalPrice: true },
      }),
      prisma.customer.count({
        where: { tenantId, isHighValue: true },
      }),
    ]);

    const metrics = {
      totalCustomers,
      totalOrders,
      totalRevenue: Number(revenueAgg._sum.totalPrice || 0),
      avgOrderValue: Number(avgOrderValueAgg._avg.totalPrice || 0),
      highValueCustomers,
    };

    // Cache for 5 minutes
    await CacheService.set(cacheKey, metrics, 300);

    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// Revenue trend (last 30 days)
router.get('/revenue-trend', async (req, res, next) => {
  try {
    const { tenantId } = req;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trend = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(order_date) as date,
        COUNT(*)::int as order_count,
        SUM(total_price)::numeric as revenue,
        AVG(total_price)::numeric as avg_order_value
      FROM orders
      WHERE tenant_id = ${tenantId}::uuid
        AND financial_status = 'PAID'
        AND order_date >= ${thirtyDaysAgo}
      GROUP BY DATE(order_date)
      ORDER BY date DESC
    `;

    res.json(trend);
  } catch (error) {
    next(error);
  }
});

// Top customers
router.get('/top-customers', async (req, res, next) => {
  try {
    const { tenantId } = req;
    const limit = parseInt(req.query.limit as string) || 10;

    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { totalSpent: 'desc' },
      take: limit,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderDate: true,
        rfmSegment: true,
      },
    });

    res.json(customers);
  } catch (error) {
    next(error);
  }
});

export default router;
```

**Continue with customers, orders, segments routes...**

Due to character limits, I'll provide a summary of remaining implementation:

---

### **Phase 3: Xeno Features (Days 7-9) - "Stand Out"**

#### **Day 7: Customer Segmentation**
- Build segment builder API
- Implement flexible filter DSL (JSON-based)
- Create segment membership computation
- Add segment analytics

#### **Day 8: RFM Analysis**
- Implement daily RFM scoring worker
- Create RFM matrix visualization endpoint
- Add cohort analysis queries
- Build churn prediction logic

#### **Day 9: Polish Backend**
- Add rate limiting per tenant
- Implement proper error tracking (Sentry)
- Add health checks for all dependencies
- Create comprehensive API documentation

---


### **Phase 4: Frontend + Polish (Days 10-12)**

#### **Day 10: Next.js Dashboard**
- Setup Next.js with App Router

Build authentication flow
Create dashboard layout with sidebar
Implement overview page with KPI cards
Add revenue trend chart (Recharts)
Day 11: Feature Pages

Customer list with filters
Order history with date range
Segment builder UI
RFM matrix visualization
Real-time sync status
Day 12: Documentation + Demo

Write ARCHITECTURE.md (technical decisions)
Complete README.md with setup guide
Record 7-minute demo video
Final deployment verification
Submit assignment
📋 Complete Feature ChecklistMust Have (Core Assignment)

✅ OAuth integration with Shopify
✅ Multi-tenant data isolation
✅ Customer ingestion
✅ Order ingestion
✅ Product ingestion
✅ Webhook real-time sync
✅ Dashboard with KPIs
✅ Date range filtering
✅ Top customers report
✅ Deployed service
✅ Email authentication
✅ ORM usage (Prisma)
✅ Scheduler/webhooks for sync
Should Have (Professional Touch)

✅ BullMQ for async processing
✅ Redis caching layer
✅ HMAC webhook verification
✅ Idempotency for webhooks
✅ Error tracking (Sentry)
✅ Structured logging (Pino)
✅ Health checks
✅ Rate limiting
✅ Graceful shutdown
Xeno-Specific (Stand Out)

✅ Customer segmentation builder
✅ RFM analysis
✅ Behavioral event tracking
✅ Cart abandonment detection
✅ Churn risk scoring
✅ Cohort analysis
✅ High-value customer identification