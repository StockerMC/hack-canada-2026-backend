# CLIPSTAKES API

Base URL: `https://clipstakes.<your-worker>.workers.dev`

## Authentication

Creator endpoints use anonymous device auth:

```http
X-Device-ID: <ios-identifierForVendor>
```

## Health

```http
GET /
```

## Clips

### `GET /clips/:productId`

Returns up to 20 clips ranked by `conversions`.

### `POST /clips`

Creates a clip. Coupon-first flow is enabled when `receipt_id` is supplied.

Request:

```json
{
  "receipt_id": "uuid",
  "product_id": "shopify-product-123",
  "video_url": "https://videos.clipstakes.app/clips/abc123.mp4",
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
    "video_url": "https://videos.clipstakes.app/clips/abc123.mp4",
    "conversions": 0,
    "created_at": "2026-03-07T12:00:00Z"
  },
  "instant_coupon": {
    "code": "CLIP-...",
    "value_cents": 500,
    "value_display": "$5.00",
    "type": "instant",
    "expires_at": null,
    "redeemed": false,
    "wallet_pass_url": null
  },
  "totals": {
    "available_cents": 500,
    "available_display": "$5.00"
  }
}
```

Errors:
- `404` receipt not found
- `409` receipt already used
- `400` validation/product mismatch

Notes:
- Legacy clip creation remains supported when `receipt_id` is omitted.
- Clip creation never fails due to WalletWallet outage/quota issues.

## Receipts

### `GET /receipt/:id`

```json
{
  "id": "uuid",
  "product_ids": ["product-1"],
  "used_for_conversions": true,
  "clip_created": true,
  "created_at": "2026-03-07T12:00:00Z"
}
```

## Conversions

### `POST /conversions`

Shopify webhook endpoint. Requires valid `X-Shopify-Hmac-Sha256`.

Behavior:
- Extracts `clip_id` from `note_attributes`
- Dedupes by order id
- Applies conversion attribution
- Creates one bonus coupon (`$5`) only on the first conversion for a clip

Response:

```json
{
  "success": true,
  "attributed": true,
  "clip_id": "uuid",
  "earnings_added": 500,
  "bonus_coupon_created": true,
  "bonus_coupon": {
    "code": "BONUS-...",
    "value_cents": 500,
    "value_display": "$5.00",
    "type": "bonus",
    "source_clip_id": "uuid",
    "created_at": "2026-03-07T12:00:00Z",
    "expires_at": null,
    "redeemed": false,
    "wallet_pass_url": null
  }
}
```

### `POST /conversions/dev`

No Shopify signature required. Uses the same attribution logic as `/conversions`.

Request:

```json
{
  "clip_id": "uuid",
  "order_id": "order-123"
}
```

Response:

```json
{
  "success": true,
  "attributed": true,
  "clip_id": "uuid",
  "bonus_coupon_created": true
}
```

## Rewards

### `GET /rewards/me`

Returns coupons + available totals for the `X-Device-ID` user.

```json
{
  "coupons": [
    {
      "code": "CLIP-...",
      "value_cents": 500,
      "value_display": "$5.00",
      "type": "instant",
      "source_clip_id": "uuid",
      "created_at": "2026-03-07T12:00:00Z",
      "expires_at": null,
      "redeemed": false,
      "wallet_pass_url": null
    }
  ],
  "totals": {
    "available_cents": 500,
    "available_display": "$5.00"
  }
}
```

## Coupons

### `POST /coupons/redeem`

Request:

```json
{
  "code": "CLIP-..."
}
```

Response:

```json
{
  "coupon": {
    "code": "CLIP-...",
    "value_cents": 500,
    "value_display": "$5.00",
    "type": "instant",
    "source_clip_id": "uuid",
    "created_at": "2026-03-07T12:00:00Z",
    "expires_at": null,
    "redeemed": true,
    "wallet_pass_url": null
  },
  "totals": {
    "available_cents": 0,
    "available_display": "$0.00"
  }
}
```

Errors:
- `404` coupon not found
- `409` already redeemed/expired

## Uploads

Both aliases are supported:
- `POST /upload`
- `POST /upload-url`

Both return the same payload with `upload_url`, `video_id`, `key`, and `video_url`.
