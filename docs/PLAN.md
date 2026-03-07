# CLIPSTAKES Backend Implementation Plan

# NOTE
This project uses Bun and not npm.

## Context

Building the Cloudflare Workers + Hono backend for CLIPSTAKES - a social commerce platform where users scan QR codes on products/receipts, record short video clips, and earn money when friends purchase through their clips.

**Current State:** Minimal Hono scaffold with only a "Hello Hono!" route. All backend logic needs to be built from scratch.

**Backend Stack:**
- Workers + Hono (TypeScript)
- Neon (Postgres) with sqlc for type-safe queries
- R2 for video storage (presigned URLs)
- APNs push notifications (8-hour App Clip window)
- Shopify integration (webhooks, product catalog)

---

## Authentication

**Approach:** Device ID only (anonymous tracking)
- Users identified by iOS `identifierForVendor`
- No sign-in flow required
- Device ID passed as header: `X-Device-ID`

---

## Database Schema

### Tables (Neon/Postgres)

```
users
├── id: uuid (PK)
├── device_id: text (unique, iOS identifierForVendor)
├── push_token: text (nullable, APNs device token)
├── earnings: integer (cents, default 0)
├── created_at: timestamp

clips
├── id: uuid (PK)
├── user_id: uuid (FK → users)
├── product_id: text (Shopify product ID)
├── video_url: text (R2 URL)
├── conversions: integer (default 0)
├── created_at: timestamp

receipts
├── id: uuid (PK)
├── product_ids: text[] (array of Shopify product IDs)
├── used_for_conversions: boolean (default false)
├── created_at: timestamp
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/clips/:productId` | Get clips for a product (for viewers) |
| `GET` | `/receipt/:id` | Get receipt details (validates creator eligibility) |
| `POST` | `/clips` | Create a new clip (after recording) |
| `POST` | `/upload-url` | Get presigned R2 URL for video upload |
| `POST` | `/conversions` | Record a conversion (Shopify webhook) |
| `GET` | `/earnings/:userId` | Get creator's earnings |
| `GET` | `/wallet/:userId` | Generate Apple Wallet pass |

---

## Implementation Phases

### Phase 1: Project Setup & Dependencies

**Files to modify:**
- `package.json` - Add dependencies
- `wrangler.jsonc` - Configure bindings
- `src/index.ts` - App structure

**Dependencies to add:**
```
@neondatabase/serverless  # Neon Postgres client
zod                       # Request validation
passkit-generator         # Apple Wallet pass generation
```

**sqlc setup:**
- Install sqlc CLI: `brew install sqlc` or `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`
- Configure for TypeScript output with `sqlc.yaml`

**Wrangler bindings:**
```jsonc
{
  "vars": {
    "DATABASE_URL": "...",       // Neon connection string
    "SHOPIFY_WEBHOOK_SECRET": "...",
    "APNS_KEY": "..."
  },
  "r2_buckets": [
    { "binding": "VIDEOS", "bucket_name": "clipstakes-videos" }
  ]
}
```

---

### Phase 2: Database Schema (sqlc)

**Files to create:**
- `sql/schema.sql` - Table definitions (CREATE TABLE statements)
- `sql/queries.sql` - Named SQL queries with sqlc annotations
- `sqlc.yaml` - sqlc configuration
- `src/db/index.ts` - Database client setup

**Generated files (by sqlc):**
- `src/db/queries.ts` - Type-safe query functions
- `src/db/models.ts` - TypeScript interfaces for tables

**sqlc.yaml:**
```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "sql/queries.sql"
    schema: "sql/schema.sql"
    gen:
      typescript:
        out: "src/db"
        driver: "pg"
```

---

### Phase 3: Core API Routes

**Files to create:**
- `src/routes/clips.ts` - Clip endpoints
- `src/routes/receipts.ts` - Receipt endpoints
- `src/routes/conversions.ts` - Conversion tracking
- `src/routes/earnings.ts` - Earnings endpoints
- `src/routes/upload.ts` - R2 presigned URL generation

**Route implementations:**

#### `GET /clips/:productId`
- Query clips table by product_id
- Return clips ranked by conversions (social proof)
- Include creator info for attribution

#### `GET /receipt/:id`
- Validate receipt exists
- Return product_ids for clip creation flow
- Check if already used for conversions

#### `POST /clips`
- Validate request body (user_id, product_id, video_url)
- Insert into clips table
- Return created clip

#### `POST /upload-url`
- Generate unique object key (uuid)
- Create presigned PUT URL for R2
- Return URL + object key for client

#### `POST /conversions`
- Verify Shopify webhook signature
- Find clip by product_id that drove the sale
- Increment clip's conversions count
- Add $5 to creator's earnings
- Send push notification to creator

#### `GET /earnings/:userId`
- Return user's total earnings
- Optionally include earnings history

---

### Phase 4: Shopify Webhook Integration

**Files to create:**
- `src/lib/shopify.ts` - Webhook signature verification
- `src/lib/webhooks.ts` - Webhook handlers

**Webhook flow:**
1. Receive `orders/create` webhook
2. Verify HMAC signature
3. Extract product_id and customer metadata (clip attribution)
4. Call conversion tracking logic

---

### Phase 5: Push Notifications (APNs)

**Files to create:**
- `src/lib/push.ts` - APNs client

**Implementation:**
- Use APNs HTTP/2 API
- Send "You earned $5!" notification on conversion
- Handle 8-hour App Clip push window

---

### Phase 6: R2 Video Storage

**Files to create:**
- `src/lib/r2.ts` - R2 helpers

**Implementation:**
- Generate presigned PUT URLs for upload
- Generate presigned GET URLs for playback
- Set appropriate content-type headers

---

### Phase 7: Apple Wallet Passes (Earnings Payout)

**Files to create:**
- `src/lib/wallet.ts` - PassKit pass generation
- `src/routes/wallet.ts` - Wallet endpoints

**New endpoint:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/wallet/:userId` | Generate Apple Wallet pass with earnings |

**Implementation:**
- Generate `.pkpass` files (store credit passes)
- Sign passes with Apple Wallet certificate
- Pass shows current earnings as store credit
- Update pass when earnings change (push updates)

**Wrangler secrets:**
```
WALLET_PASS_TYPE_ID     # com.example.pass.clipstakes
WALLET_TEAM_ID          # Apple Team ID
WALLET_CERT             # Base64 encoded .p12 certificate
WALLET_CERT_PASSWORD    # Certificate password
```

---

## File Structure

```
sql/
├── schema.sql            # CREATE TABLE statements
└── queries.sql           # sqlc annotated queries

src/
├── index.ts              # App entry, route mounting
├── db/
│   ├── index.ts          # DB client
│   ├── queries.ts        # (generated) type-safe query functions
│   └── models.ts         # (generated) TypeScript interfaces
├── routes/
│   ├── clips.ts          # GET/POST /clips
│   ├── receipts.ts       # GET /receipt/:id
│   ├── conversions.ts    # POST /conversions
│   ├── earnings.ts       # GET /earnings/:userId
│   ├── upload.ts         # POST /upload-url
│   └── wallet.ts         # GET /wallet/:userId (Apple Wallet)
├── lib/
│   ├── shopify.ts        # Webhook verification
│   ├── push.ts           # APNs notifications
│   ├── r2.ts             # R2 presigned URLs
│   └── wallet.ts         # PassKit pass generation
└── types.ts              # Shared types
```

---

## Verification

1. **Local development:** `npm run dev` with wrangler
2. **Database:** Run `sqlc generate` then apply `sql/schema.sql` to Neon
3. **R2:** Test presigned URL generation and upload
4. **Webhooks:** Use Shopify CLI to trigger test webhooks
5. **Push:** Test with APNs sandbox environment

---

## Decisions Made

- **Database:** Neon (Postgres) with sqlc
- **Authentication:** Device ID only (`identifierForVendor`)
- **Earnings Payout:** Apple Wallet passes (store credit)
