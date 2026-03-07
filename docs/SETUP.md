# CLIPSTAKES Setup & Development Guide

## Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included as dev dependency)
- [sqlc](https://sqlc.dev/) for generating type-safe queries (optional)
- A [Neon](https://neon.tech/) Postgres database
- A Cloudflare account with R2 enabled

---

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Up Neon Database

1. Create a Neon project at https://neon.tech
2. Run the schema against your database:

```bash
psql $DATABASE_URL -f sql/schema.sql
```

Or paste `sql/schema.sql` contents into the Neon SQL Editor.

### 3. Create R2 Bucket

```bash
bunx wrangler r2 bucket create clipstakes-videos
```

### 4. Configure Secrets

Set all required secrets via Wrangler:

```bash
# Neon database connection
bunx wrangler secret put DATABASE_URL
# Paste your Neon connection string (postgres://...)

# Shopify webhook verification
bunx wrangler secret put SHOPIFY_WEBHOOK_SECRET

# APNs push notifications
bunx wrangler secret put APNS_KEY_ID
bunx wrangler secret put APNS_TEAM_ID
bunx wrangler secret put APNS_PRIVATE_KEY  # Base64 encoded .p8 file

# Apple Wallet (optional)
bunx wrangler secret put WALLET_PASS_TYPE_ID
bunx wrangler secret put WALLET_TEAM_ID
bunx wrangler secret put WALLET_CERT          # Base64 encoded .p12
bunx wrangler secret put WALLET_CERT_PASSWORD
```

### 5. Run Development Server

```bash
bun run dev
```

The API will be available at `http://localhost:8787`

---

## Development

### Project Structure

```
├── src/
│   ├── index.ts          # App entry point
│   ├── types.ts          # Environment bindings
│   ├── db/
│   │   └── index.ts      # Database client + queries
│   ├── routes/
│   │   ├── clips.ts      # Clip endpoints
│   │   ├── receipts.ts   # Receipt endpoints
│   │   ├── earnings.ts   # Earnings endpoints
│   │   ├── upload.ts     # Video upload
│   │   ├── conversions.ts# Shopify webhook
│   │   └── wallet.ts     # Apple Wallet
│   └── lib/
│       ├── shopify.ts    # Webhook verification
│       ├── push.ts       # APNs client
│       ├── r2.ts         # R2 helpers
│       └── wallet.ts     # Pass generation
├── sql/
│   ├── schema.sql        # Database tables
│   └── queries.sql       # sqlc query definitions
├── wrangler.jsonc        # Cloudflare config
├── sqlc.yaml             # sqlc config
└── docs/
    ├── PLAN.md           # Implementation plan
    ├── API.md            # API documentation
    └── SETUP.md          # This file
```

### Type Checking

```bash
bunx tsc --noEmit
```

### Generate Types from SQL (Optional)

If you modify `sql/queries.sql`, regenerate the TypeScript:

```bash
sqlc generate
```

Note: The current implementation manually defines types in `src/db/index.ts`.
sqlc can automate this if you install it (`brew install sqlc`).

---

## Deployment

### CI/CD (Auto-Deploy on Push)

The project includes a GitHub Actions workflow that automatically deploys to Cloudflare Workers when you push to `main`.

**Setup:**

1. Create a Cloudflare API Token:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Create Token > Use template "Edit Cloudflare Workers"
   - Or create custom token with permissions:
     - Account: Workers Scripts: Edit
     - Zone: Workers Routes: Edit (if using custom domains)

2. Add the token to GitHub:
   - Go to your repo > Settings > Secrets and variables > Actions
   - Create secret: `CLOUDFLARE_API_TOKEN` with your token value

3. Push to `main` - the workflow will:
   - Run type checking
   - Run tests
   - Deploy to Cloudflare Workers

### Manual Deploy

```bash
bun run deploy
```

### Custom Domain (Optional)

1. Add a custom domain in Cloudflare Dashboard
2. Update the worker route to use your domain

### R2 Public Access

For video playback, configure R2 public access:

1. Go to R2 > clipstakes-videos > Settings
2. Enable "Public access" or configure a custom domain
3. Update `video_url` generation in `src/routes/upload.ts`

---

## Shopify Integration

### Register Webhook

Register your webhook endpoint in Shopify Admin:

1. Go to Settings > Notifications > Webhooks
2. Create webhook for `orders/create`
3. URL: `https://your-worker.workers.dev/conversions`
4. Format: JSON
5. Copy the webhook secret and set it via `wrangler secret put SHOPIFY_WEBHOOK_SECRET`

### Clip Attribution

For conversions to be tracked, the iOS app must include `clip_id` in checkout note attributes:

```json
{
  "note_attributes": [
    { "name": "clip_id", "value": "<clip-uuid>" }
  ]
}
```

---

## APNs Setup

### Generate APNs Key

1. Go to Apple Developer > Certificates, Identifiers & Profiles
2. Keys > Create a new key
3. Enable "Apple Push Notifications service (APNs)"
4. Download the .p8 file

### Configure Secrets

```bash
# Key ID from Apple Developer portal
bunx wrangler secret put APNS_KEY_ID

# Your Apple Team ID
bunx wrangler secret put APNS_TEAM_ID

# Base64 encode the .p8 file
cat AuthKey_XXXXX.p8 | base64 | bunx wrangler secret put APNS_PRIVATE_KEY
```

---

## Apple Wallet Setup (Optional)

### Create Pass Type ID

1. Apple Developer > Identifiers > Pass Type IDs
2. Create new Pass Type ID (e.g., `pass.com.clipstakes.credit`)

### Generate Signing Certificate

1. Apple Developer > Certificates
2. Create "Pass Type ID Certificate"
3. Download and export as .p12

### Configure Secrets

```bash
bunx wrangler secret put WALLET_PASS_TYPE_ID  # pass.com.clipstakes.credit
bunx wrangler secret put WALLET_TEAM_ID       # Your Team ID
cat pass.p12 | base64 | bunx wrangler secret put WALLET_CERT
bunx wrangler secret put WALLET_CERT_PASSWORD
```

---

## Troubleshooting

### "Cannot find name 'R2Bucket'"

Ensure `@cloudflare/workers-types` is in devDependencies and tsconfig.json includes:
```json
"types": ["@cloudflare/workers-types"]
```

### Database connection errors

- Verify `DATABASE_URL` secret is set correctly
- Ensure Neon database is not paused (free tier pauses after inactivity)
- Check connection string format: `postgres://user:pass@host/db?sslmode=require`

### Push notifications not working

- Verify APNs keys are correctly base64 encoded
- Check bundle ID matches in `src/lib/push.ts` (`apns-topic` header)
- Use sandbox endpoint for development (`sandbox = true`)

### Shopify webhook 401 errors

- Verify webhook secret matches exactly
- Check that the raw body is being used for HMAC verification (not parsed JSON)
