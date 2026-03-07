# ClipStakes Backend

Cloudflare Workers backend for clip attribution, coupon-first rewards, and WalletWallet pass sync.

## Quick Start

```txt
bun install
bun run dev
```

```txt
bun run deploy
```

Run tests:

```txt
bun test tests/api.test.ts tests/lib.test.ts tests/db.test.ts
```

## Environment

Copy `.env.example` values into your deployed worker secrets.

Required:
- `DATABASE_URL`
- `SHOPIFY_WEBHOOK_SECRET`

WalletWallet integration (optional, server-side only):
- `WALLETWALLET_API_KEY`
- `WALLETWALLET_BASE_URL` (defaults to `https://api.walletwallet.dev`)
- `WALLETWALLET_TEMPLATE_ID`

If WalletWallet is unavailable, core clip creation and conversions still succeed and coupons are still returned with `wallet_pass_url: null`.

## Database Migration

Apply:

```txt
sql/migrations/20260307_coupon_wallet.sql
```

This adds:
- `coupons` for instant/bonus rewards
- `conversion_events` for `order_id` idempotency
- race-safe receipt clip usage fields (`receipts.clip_created`, `receipts.clip_id`, `clips.receipt_id`)

## Route Notes

- `POST /clips` supports receipt-gated coupon issuance (and keeps legacy clip creation when `receipt_id` is omitted).
- `POST /conversions` keeps Shopify HMAC verification.
- `POST /conversions/dev` mirrors the same attribution + bonus logic without Shopify signature checks.
- `GET /rewards/me` returns coupon list + totals for the `X-Device-ID` user.
- `POST /coupons/redeem` redeems one coupon code.
- Both `POST /upload` and `POST /upload-url` are supported aliases.
