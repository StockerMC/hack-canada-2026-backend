-- CLIPSTAKES Database Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT UNIQUE NOT NULL,
    push_token TEXT,
    earnings INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_ids TEXT[] NOT NULL,
    used_for_conversions BOOLEAN NOT NULL DEFAULT FALSE,
    clip_created BOOLEAN NOT NULL DEFAULT FALSE,
    clip_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
    product_id TEXT NOT NULL,
    video_url TEXT NOT NULL,
    text_overlay TEXT,
    text_position TEXT,
    duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    conversions INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE receipts
    ADD CONSTRAINT fk_receipts_clip_id
    FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE SET NULL;

CREATE TABLE creator_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    wallet_code TEXT NOT NULL UNIQUE,
    pass_url TEXT,
    qr_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reward_transactions (
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

CREATE TABLE coupons (
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

CREATE TABLE conversion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_clips_product_id ON clips(product_id);
CREATE INDEX idx_clips_user_id ON clips(user_id);
CREATE INDEX idx_clips_conversions ON clips(conversions DESC);
CREATE UNIQUE INDEX idx_clips_receipt_id_unique ON clips(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX idx_users_device_id ON users(device_id);
CREATE INDEX idx_receipts_clip_created ON receipts(clip_created);
CREATE INDEX idx_creator_wallets_user_id ON creator_wallets(user_id);
CREATE INDEX idx_creator_wallets_wallet_code ON creator_wallets(wallet_code);
CREATE INDEX idx_conversions_clip_id ON conversions(clip_id);
CREATE INDEX idx_conversions_user_id ON conversions(user_id);
CREATE INDEX idx_reward_transactions_user_id ON reward_transactions(user_id);
CREATE INDEX idx_reward_transactions_clip_id ON reward_transactions(clip_id);
CREATE INDEX idx_reward_transactions_conversion_id ON reward_transactions(conversion_id);
CREATE INDEX idx_reward_transactions_created_at ON reward_transactions(created_at DESC);
CREATE INDEX idx_coupons_user_id ON coupons(user_id);
CREATE INDEX idx_coupons_clip_id ON coupons(clip_id);
CREATE UNIQUE INDEX idx_coupons_bonus_once_per_clip ON coupons(clip_id) WHERE type = 'bonus';
CREATE INDEX idx_conversion_events_clip_id ON conversion_events(clip_id);
CREATE INDEX idx_conversion_events_user_id ON conversion_events(user_id);
