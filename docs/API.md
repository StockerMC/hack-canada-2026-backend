# CLIPSTAKES API

Base URL: `https://clipstakes.<your-worker>.workers.dev`

## Authentication

Creator identity is anonymous and required on creator-facing routes:

```http
X-Device-ID: <ios-identifierForVendor>
```

## Health

```http
GET /
```

## Clips

### `POST /clips`

Creates a clip, attributes it to the `X-Device-ID` creator, and credits +500 cents.

Request:

```json
{
  "receipt_id": "uuid",
  "product_id": "shopify-product-123",
  "video_url": "https://clipstakes.skilled5041.workers.dev/upload/clips/abc123.mp4",
  "text_overlay": "optional",
  "text_position": "optional",
  "duration_seconds": 15
}
```

Response (`201`):

```json
{
  "clip": {
    "id": "uuid",
    "receipt_id": "uuid",
    "product_id": "shopify-product-123",
    "video_url": "https://clipstakes.skilled5041.workers.dev/upload/clips/abc123.mp4",
    "conversions": 0,
    "created_at": "2026-03-07T12:00:00Z"
  },
  "reward": {
    "credited_cents": 500,
    "credited_display": "$5.00",
    "reason": "clip_published"
  },
  "wallet": {
    "wallet_code": "CLIP-...",
    "pass_url": "https://clipstakes.<your-worker>.workers.dev/wallet/CLIP-.../pass",
    "qr_payload": "CLIP-..."
  },
  "balances": {
    "available_cents": 500,
    "available_display": "$5.00",
    "lifetime_earned_cents": 500,
    "lifetime_earned_display": "$5.00"
  }
}
```

Errors:
- `404` receipt not found
- `409` receipt already used
- `400` validation/product mismatch

### `GET /clips/:productId`

Returns up to 20 clips ranked by `conversions`.

## Conversions

### `POST /conversions`

Shopify webhook endpoint. Requires valid `X-Shopify-Hmac-Sha256`.

Behavior:
- Extracts `clip_id` from Shopify `note_attributes`
- Dedupes by provider `order_id`
- Credits +500 on each unique conversion
- Credits still apply after 8 hours
- Push urgency only inside the 8-hour window

Response:

```json
{
  "success": true,
  "attributed": true,
  "clip_id": "uuid",
  "reward": {
    "credited_cents": 500,
    "credited_display": "$5.00",
    "reason": "conversion"
  },
  "balances": {
    "available_cents": 1000,
    "available_display": "$10.00"
  },
  "push": {
    "sent": true,
    "within_window": true
  }
}
```

### `POST /conversions/dev`

Same attribution + idempotency + credit logic as `/conversions`, but no Shopify signature.

Request:

```json
{
  "clip_id": "uuid",
  "order_id": "order-123"
}
```

## Rewards

### `GET /rewards/me`

Returns wallet identity, balances, and recent ledger transactions for `X-Device-ID`.

```json
{
  "wallet": {
    "wallet_code": "CLIP-...",
    "pass_url": "https://clipstakes.<your-worker>.workers.dev/wallet/CLIP-.../pass",
    "qr_payload": "CLIP-..."
  },
  "balances": {
    "available_cents": 2500,
    "available_display": "$25.00",
    "lifetime_earned_cents": 2500,
    "lifetime_earned_display": "$25.00"
  },
  "transactions": [
    {
      "id": "uuid",
      "type": "conversion",
      "amount_cents": 500,
      "amount_display": "$5.00",
      "clip_id": "uuid",
      "order_id": "order-123",
      "created_at": "2026-03-07T12:00:00Z"
    }
  ]
}
```

## Wallet / Redemption

### `POST /wallet/redeem`

Cashier/POS redemption using stable wallet QR code.

Request:

```json
{
  "wallet_code": "CLIP-...",
  "amount_cents": 1200,
  "order_id": "pos-123"
}
```

Response:

```json
{
  "success": true,
  "wallet": {
    "wallet_code": "CLIP-...",
    "pass_url": "https://clipstakes.<your-worker>.workers.dev/wallet/CLIP-.../pass",
    "qr_payload": "CLIP-..."
  },
  "redemption": {
    "order_id": "pos-123",
    "amount_cents": 1200,
    "amount_display": "$12.00"
  },
  "balances": {
    "available_cents": 1300,
    "available_display": "$13.00",
    "lifetime_earned_cents": 2500,
    "lifetime_earned_display": "$25.00"
  }
}
```

Errors:
- `404` wallet not found
- `409` insufficient balance

### `GET /wallet/:wallet_code/balance`

Scanner-friendly wallet balance lookup.

### `GET /wallet/:wallet_code/pass`

Returns an Apple Wallet pass file (`application/vnd.apple.pkpass`) for the wallet code.

## Uploads

Both aliases are supported:
- `POST /upload`
- `POST /upload-url`

Both return the same payload with `upload_url`, `video_id`, `key`, and `video_url` as absolute HTTPS URLs.

## Legacy Coupon Compatibility

`POST /coupons/redeem` remains available for previously-issued coupons.
