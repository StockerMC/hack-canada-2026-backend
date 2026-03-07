-- name: GetUserByDeviceId :one
SELECT * FROM users WHERE device_id = $1;

-- name: CreateUser :one
INSERT INTO users (device_id, push_token)
VALUES ($1, $2)
RETURNING *;

-- name: UpdateUserPushToken :exec
UPDATE users SET push_token = $2 WHERE id = $1;

-- name: UpdateUserEarnings :exec
UPDATE users SET earnings = earnings + $2 WHERE id = $1;

-- name: GetUserEarnings :one
SELECT id, earnings FROM users WHERE id = $1;

-- name: GetClipsByProductId :many
SELECT c.*, u.device_id AS creator_device_id
FROM clips c
JOIN users u ON c.user_id = u.id
WHERE c.product_id = $1
ORDER BY c.conversions DESC
LIMIT 20;

-- name: GetClipById :one
SELECT * FROM clips WHERE id = $1;

-- name: CreateClip :one
INSERT INTO clips (user_id, product_id, video_url, text_overlay, text_position, duration_seconds)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: IncrementClipConversions :exec
UPDATE clips SET conversions = conversions + 1 WHERE id = $1;

-- name: GetClipWithUser :one
SELECT c.*, u.push_token, u.id AS creator_user_id
FROM clips c
JOIN users u ON c.user_id = u.id
WHERE c.id = $1;

-- name: GetReceiptById :one
SELECT * FROM receipts WHERE id = $1;

-- name: CreateReceipt :one
INSERT INTO receipts (product_ids)
VALUES ($1)
RETURNING *;

-- name: MarkReceiptUsed :exec
UPDATE receipts
SET used_for_conversions = TRUE
WHERE id = $1;

-- name: GetCouponsByUserId :many
SELECT * FROM coupons WHERE user_id = $1 ORDER BY created_at DESC;

-- name: GetCouponByCode :one
SELECT *
FROM coupons
WHERE user_id = $1
  AND code = $2
LIMIT 1;

-- name: RedeemCouponByCode :one
UPDATE coupons
SET redeemed = TRUE,
    redeemed_at = NOW()
WHERE user_id = $1
  AND code = $2
  AND redeemed = FALSE
  AND (expires_at IS NULL OR expires_at > NOW())
RETURNING *;

-- name: UpdateCouponWalletPassUrl :one
UPDATE coupons
SET wallet_pass_url = $2
WHERE id = $1
RETURNING *;

-- name: GetAvailableCouponTotals :one
SELECT COALESCE(SUM(value_cents), 0)::INT AS available_cents
FROM coupons
WHERE user_id = $1
  AND redeemed = FALSE
  AND (expires_at IS NULL OR expires_at > NOW());
