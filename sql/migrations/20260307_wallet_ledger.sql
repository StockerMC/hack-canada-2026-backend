-- Persistent wallet identity + reward ledger migration

CREATE TABLE IF NOT EXISTS creator_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  wallet_code TEXT NOT NULL UNIQUE,
  pass_url TEXT,
  qr_payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE SET NULL,
  conversion_id UUID REFERENCES conversions(id) ON DELETE SET NULL,
  order_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('clip_published', 'conversion', 'wallet_redeem')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_creator_wallets_user_id
  ON creator_wallets(user_id);

CREATE INDEX IF NOT EXISTS idx_creator_wallets_wallet_code
  ON creator_wallets(wallet_code);

CREATE INDEX IF NOT EXISTS idx_conversions_clip_id
  ON conversions(clip_id);

CREATE INDEX IF NOT EXISTS idx_conversions_user_id
  ON conversions(user_id);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_user_id
  ON reward_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_clip_id
  ON reward_transactions(clip_id);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_conversion_id
  ON reward_transactions(conversion_id);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_created_at
  ON reward_transactions(created_at DESC);

INSERT INTO conversions (order_id, clip_id, user_id, created_at)
SELECT ce.order_id, ce.clip_id, ce.user_id, ce.created_at
FROM conversion_events ce
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO reward_transactions (
  user_id,
  clip_id,
  conversion_id,
  order_id,
  type,
  amount_cents,
  created_at,
  idempotency_key
)
SELECT
  cp.user_id,
  cp.clip_id,
  bonus_conv.id,
  bonus_conv.order_id,
  CASE
    WHEN cp.type = 'instant' THEN 'clip_published'
    ELSE 'conversion'
  END,
  cp.value_cents,
  cp.created_at,
  'legacy_coupon:' || cp.id::text
FROM coupons cp
LEFT JOIN LATERAL (
  SELECT cv.id, cv.order_id
  FROM conversions cv
  WHERE cp.type = 'bonus'
    AND cv.clip_id = cp.clip_id
  ORDER BY cv.created_at ASC
  LIMIT 1
) bonus_conv ON TRUE
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO creator_wallets (user_id, wallet_code, qr_payload)
SELECT
  u.id,
  'CLIP-' || UPPER(REPLACE(u.id::text, '-', '')),
  'CLIP-' || UPPER(REPLACE(u.id::text, '-', ''))
FROM users u
LEFT JOIN creator_wallets cw ON cw.user_id = u.id
WHERE cw.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

UPDATE users u
SET earnings = agg.total
FROM (
  SELECT user_id, COALESCE(SUM(amount_cents), 0)::INT AS total
  FROM reward_transactions
  GROUP BY user_id
) agg
WHERE u.id = agg.user_id;
