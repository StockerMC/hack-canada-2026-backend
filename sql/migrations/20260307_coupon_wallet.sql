-- Coupon-first rewards + WalletWallet integration schema migration

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS clip_created BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS clip_id UUID;

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS receipt_id UUID;

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS text_overlay TEXT;

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS text_position TEXT;

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_clips_receipt_id'
  ) THEN
    ALTER TABLE clips
      ADD CONSTRAINT fk_clips_receipt_id
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_receipts_clip_id'
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT fk_receipts_clip_id
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('instant', 'bonus')),
  value_cents INTEGER NOT NULL CHECK (value_cents > 0),
  redeemed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  wallet_pass_url TEXT
);

CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clips_receipt_id_unique
  ON clips(receipt_id)
  WHERE receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_clip_created
  ON receipts(clip_created);

CREATE INDEX IF NOT EXISTS idx_coupons_user_id
  ON coupons(user_id);

CREATE INDEX IF NOT EXISTS idx_coupons_clip_id
  ON coupons(clip_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_bonus_once_per_clip
  ON coupons(clip_id)
  WHERE type = 'bonus';

CREATE INDEX IF NOT EXISTS idx_conversion_events_clip_id
  ON conversion_events(clip_id);

CREATE INDEX IF NOT EXISTS idx_conversion_events_user_id
  ON conversion_events(user_id);
