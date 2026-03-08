import { neon } from "@neondatabase/serverless"

export type User = {
  id: string
  device_id: string
  push_token: string | null
  earnings: number
  created_at: Date
}

export type Clip = {
  id: string
  user_id: string
  receipt_id: string | null
  product_id: string
  video_url: string
  text_overlay: string | null
  text_position: string | null
  duration_seconds: number | null
  conversions: number
  created_at: Date
}

export type Receipt = {
  id: string
  product_ids: string[]
  used_for_conversions: boolean
  clip_created: boolean
  clip_id: string | null
  created_at: Date
}

export type CouponType = "instant" | "bonus"

export type Coupon = {
  id: string
  user_id: string
  clip_id: string | null
  code: string
  type: CouponType
  value_cents: number
  redeemed: boolean
  created_at: Date
  expires_at: Date | null
  redeemed_at: Date | null
  wallet_pass_url: string | null
}

export type CreatorWallet = {
  id: string
  user_id: string
  wallet_code: string
  pass_url: string | null
  qr_payload: string
  created_at: Date
}

export type RewardTransactionType = "clip_published" | "conversion" | "wallet_redeem"

export type RewardTransaction = {
  id: string
  user_id: string
  clip_id: string | null
  conversion_id: string | null
  order_id: string | null
  type: RewardTransactionType
  amount_cents: number
  created_at: Date
  idempotency_key: string
}

export type RewardBalances = {
  available_cents: number
  lifetime_earned_cents: number
}

export type ClipWithCreator = Clip & {
  creator_device_id: string
}

export type ClipWithUser = Clip & {
  push_token: string | null
  creator_user_id: string
}

export type CreateClipWithReceiptInput = {
  user_id: string
  receipt_id: string
  product_id: string
  video_url: string
  text_overlay?: string | null
  text_position?: string | null
  duration_seconds?: number | null
  reward_cents: number
}

export type CreateClipWithReceiptResult =
  | { status: "receipt_not_found" | "receipt_already_used" | "product_not_in_receipt" }
  | {
      status: "created"
      clip: Clip
      reward_transaction: RewardTransaction
    }

export type CreateClipAndRewardInput = {
  user_id: string
  product_id: string
  video_url: string
  text_overlay?: string | null
  text_position?: string | null
  duration_seconds?: number | null
  reward_cents: number
}

export type CreateClipAndRewardResult = {
  clip: Clip
  reward_transaction: RewardTransaction
}

export type ProcessConversionInput = {
  order_id: string
  clip_id: string
  reward_cents: number
}

export type ProcessConversionResult =
  | { status: "clip_not_found" }
  | {
      status: "ok"
      clip_id: string
      creator_user_id: string
      push_token: string | null
      conversion_recorded: boolean
      reward_credited: boolean
      reward_transaction: RewardTransaction | null
      within_window: boolean
    }

export type RedeemWalletInput = {
  wallet_code: string
  amount_cents: number
  order_id: string
}

export type RedeemWalletResult =
  | { status: "wallet_not_found" }
  | {
      status: "insufficient_balance"
      wallet: CreatorWallet
      available_cents: number
    }
  | {
      status: "already_processed"
      wallet: CreatorWallet
      reward_transaction: RewardTransaction
      balances: RewardBalances
    }
  | {
      status: "redeemed"
      wallet: CreatorWallet
      reward_transaction: RewardTransaction
      balances: RewardBalances
    }

function parseJsonRow<T>(value: unknown): T | null {
  if (!value) return null
  if (typeof value === "string") {
    return JSON.parse(value) as T
  }
  return value as T
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code === "23505"
  )
}

function generateWalletCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let suffix = ""
  for (let i = 0; i < 8; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length)
    suffix += alphabet[index]
  }
  return `CLIP-${suffix}`
}

function walletRedeemIdempotencyKey(walletCode: string, orderId: string): string {
  return `wallet_redeem:${walletCode}:${orderId}`
}

export interface Db {
  getUserByDeviceId(deviceId: string): Promise<User | null>
  createUser(deviceId: string, pushToken: string | null): Promise<User>
  updateUserPushToken(userId: string, pushToken: string): Promise<void>
  updateUserEarnings(userId: string, amount: number): Promise<void>
  getUserEarnings(userId: string): Promise<{ id: string; earnings: number } | null>

  getClipsByProductId(productId: string): Promise<ClipWithCreator[]>
  getClipById(clipId: string): Promise<Clip | null>
  createClip(
    userId: string,
    productId: string,
    videoUrl: string,
    options?: {
      text_overlay?: string | null
      text_position?: string | null
      duration_seconds?: number | null
    }
  ): Promise<Clip>
  createClipWithReceiptAndReward(input: CreateClipWithReceiptInput): Promise<CreateClipWithReceiptResult>
  createClipAndReward(input: CreateClipAndRewardInput): Promise<CreateClipAndRewardResult>
  incrementClipConversions(clipId: string): Promise<void>
  getClipWithUser(clipId: string): Promise<ClipWithUser | null>

  getReceiptById(receiptId: string): Promise<Receipt | null>
  createReceipt(productIds: string[]): Promise<Receipt>
  markReceiptUsed(receiptId: string): Promise<void>

  processConversionReward(input: ProcessConversionInput): Promise<ProcessConversionResult>

  ensureCreatorWallet(userId: string): Promise<CreatorWallet>
  getCreatorWalletByUserId(userId: string): Promise<CreatorWallet | null>
  getCreatorWalletByCode(walletCode: string): Promise<CreatorWallet | null>
  updateCreatorWalletPassUrl(walletId: string, passUrl: string): Promise<CreatorWallet | null>

  getRewardBalances(userId: string): Promise<RewardBalances>
  getRewardTransactionsByUserId(userId: string, limit?: number): Promise<RewardTransaction[]>
  redeemWallet(input: RedeemWalletInput): Promise<RedeemWalletResult>

  getCouponsByUserId(userId: string): Promise<Coupon[]>
  getCouponByCode(userId: string, code: string): Promise<Coupon | null>
  redeemCouponByCode(userId: string, code: string): Promise<Coupon | null>
  updateCouponWalletPassUrl(couponId: string, walletPassUrl: string): Promise<Coupon | null>
  getAvailableCouponTotals(userId: string): Promise<{ available_cents: number }>
}

export function createDb(databaseUrl: string): Db {
  const sql = neon(databaseUrl)
  const readRewardBalances = async (userId: string): Promise<RewardBalances> => {
    const rows = await sql`
      SELECT
        COALESCE(SUM(amount_cents), 0)::INT AS available_cents,
        COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0)::INT AS lifetime_earned_cents
      FROM reward_transactions
      WHERE user_id = ${userId}
    `

    return (
      (rows[0] as RewardBalances) ?? {
        available_cents: 0,
        lifetime_earned_cents: 0,
      }
    )
  }

  return {
    async getUserByDeviceId(deviceId: string): Promise<User | null> {
      const rows = await sql`SELECT * FROM users WHERE device_id = ${deviceId}`
      return (rows[0] as User) ?? null
    },

    async createUser(deviceId: string, pushToken: string | null): Promise<User> {
      const rows = await sql`
        INSERT INTO users (device_id, push_token)
        VALUES (${deviceId}, ${pushToken})
        RETURNING *
      `
      return rows[0] as User
    },

    async updateUserPushToken(userId: string, pushToken: string): Promise<void> {
      await sql`UPDATE users SET push_token = ${pushToken} WHERE id = ${userId}`
    },

    async updateUserEarnings(userId: string, amount: number): Promise<void> {
      await sql`UPDATE users SET earnings = earnings + ${amount} WHERE id = ${userId}`
    },

    async getUserEarnings(userId: string): Promise<{ id: string; earnings: number } | null> {
      const rows = await sql`SELECT id, earnings FROM users WHERE id = ${userId}`
      return (rows[0] as { id: string; earnings: number }) ?? null
    },

    async getClipsByProductId(productId: string): Promise<ClipWithCreator[]> {
      const rows = await sql`
        SELECT c.*, u.device_id as creator_device_id
        FROM clips c
        JOIN users u ON c.user_id = u.id
        WHERE c.product_id = ${productId}
        ORDER BY c.conversions DESC
        LIMIT 20
      `
      return rows as ClipWithCreator[]
    },

    async getClipById(clipId: string): Promise<Clip | null> {
      const rows = await sql`SELECT * FROM clips WHERE id = ${clipId}`
      return (rows[0] as Clip) ?? null
    },

    async createClip(
      userId: string,
      productId: string,
      videoUrl: string,
      options?: {
        text_overlay?: string | null
        text_position?: string | null
        duration_seconds?: number | null
      }
    ): Promise<Clip> {
      const rows = await sql`
        INSERT INTO clips (user_id, product_id, video_url, text_overlay, text_position, duration_seconds)
        VALUES (
          ${userId},
          ${productId},
          ${videoUrl},
          ${options?.text_overlay ?? null},
          ${options?.text_position ?? null},
          ${options?.duration_seconds ?? null}
        )
        RETURNING *
      `
      return rows[0] as Clip
    },

    async createClipWithReceiptAndReward(
      input: CreateClipWithReceiptInput
    ): Promise<CreateClipWithReceiptResult> {
      const [rows] = await sql.transaction([
        sql`
          WITH receipt_row AS (
            SELECT id, product_ids, clip_created
            FROM receipts
            WHERE id = ${input.receipt_id}
            FOR UPDATE
          ),
          status_row AS (
            SELECT CASE
              WHEN NOT EXISTS (SELECT 1 FROM receipt_row) THEN 'receipt_not_found'
              WHEN (SELECT clip_created FROM receipt_row) THEN 'receipt_already_used'
              WHEN NOT EXISTS (
                SELECT 1
                FROM receipt_row rr
                WHERE ${input.product_id} = ANY (rr.product_ids)
              ) THEN 'product_not_in_receipt'
              ELSE 'ok'
            END AS status
          ),
          inserted_clip AS (
            INSERT INTO clips (
              user_id,
              receipt_id,
              product_id,
              video_url,
              text_overlay,
              text_position,
              duration_seconds
            )
            SELECT
              ${input.user_id},
              ${input.receipt_id},
              ${input.product_id},
              ${input.video_url},
              ${input.text_overlay ?? null},
              ${input.text_position ?? null},
              ${input.duration_seconds ?? null}
            FROM status_row
            WHERE status = 'ok'
            RETURNING *
          ),
          updated_receipt AS (
            UPDATE receipts r
            SET clip_created = TRUE,
                clip_id = ic.id,
                used_for_conversions = TRUE
            FROM inserted_clip ic
            WHERE r.id = ${input.receipt_id}
            RETURNING r.id
          ),
          inserted_reward AS (
            INSERT INTO reward_transactions (
              user_id,
              clip_id,
              type,
              amount_cents,
              idempotency_key
            )
            SELECT
              ${input.user_id},
              ic.id,
              'clip_published',
              ${input.reward_cents},
              'clip_published:' || ic.id::text
            FROM inserted_clip ic
            RETURNING *
          ),
          updated_user AS (
            UPDATE users
            SET earnings = earnings + ${input.reward_cents}
            WHERE id IN (SELECT user_id FROM inserted_reward)
            RETURNING id
          )
          SELECT
            (SELECT status FROM status_row) AS status,
            (SELECT row_to_json(ic) FROM inserted_clip ic LIMIT 1) AS clip,
            (SELECT row_to_json(rt) FROM inserted_reward rt LIMIT 1) AS reward_transaction
        `,
      ])

      const row = rows[0] as
        | {
            status: "receipt_not_found" | "receipt_already_used" | "product_not_in_receipt" | "ok"
            clip: unknown
            reward_transaction: unknown
          }
        | undefined

      if (!row) {
        return { status: "receipt_not_found" }
      }

      if (
        row.status === "receipt_not_found" ||
        row.status === "receipt_already_used" ||
        row.status === "product_not_in_receipt"
      ) {
        return { status: row.status }
      }

      const clip = parseJsonRow<Clip>(row.clip)
      const rewardTransaction = parseJsonRow<RewardTransaction>(row.reward_transaction)

      if (!clip || !rewardTransaction) {
        throw new Error("Failed to create clip and reward transactionally")
      }

      return {
        status: "created",
        clip,
        reward_transaction: rewardTransaction,
      }
    },

    async createClipAndReward(input: CreateClipAndRewardInput): Promise<CreateClipAndRewardResult> {
      const [rows] = await sql.transaction([
        sql`
          WITH inserted_clip AS (
            INSERT INTO clips (
              user_id,
              product_id,
              video_url,
              text_overlay,
              text_position,
              duration_seconds
            )
            VALUES (
              ${input.user_id},
              ${input.product_id},
              ${input.video_url},
              ${input.text_overlay ?? null},
              ${input.text_position ?? null},
              ${input.duration_seconds ?? null}
            )
            RETURNING *
          ),
          inserted_reward AS (
            INSERT INTO reward_transactions (
              user_id,
              clip_id,
              type,
              amount_cents,
              idempotency_key
            )
            SELECT
              ${input.user_id},
              ic.id,
              'clip_published',
              ${input.reward_cents},
              'clip_published:' || ic.id::text
            FROM inserted_clip ic
            RETURNING *
          ),
          updated_user AS (
            UPDATE users
            SET earnings = earnings + ${input.reward_cents}
            WHERE id IN (SELECT user_id FROM inserted_reward)
            RETURNING id
          )
          SELECT
            (SELECT row_to_json(ic) FROM inserted_clip ic LIMIT 1) AS clip,
            (SELECT row_to_json(rt) FROM inserted_reward rt LIMIT 1) AS reward_transaction
        `,
      ])

      const row = rows[0] as
        | {
            clip: unknown
            reward_transaction: unknown
          }
        | undefined

      const clip = parseJsonRow<Clip>(row?.clip)
      const rewardTransaction = parseJsonRow<RewardTransaction>(row?.reward_transaction)

      if (!clip || !rewardTransaction) {
        throw new Error("Failed to create clip and reward transactionally")
      }

      return {
        clip,
        reward_transaction: rewardTransaction,
      }
    },

    async incrementClipConversions(clipId: string): Promise<void> {
      await sql`UPDATE clips SET conversions = conversions + 1 WHERE id = ${clipId}`
    },

    async getClipWithUser(clipId: string): Promise<ClipWithUser | null> {
      const rows = await sql`
        SELECT c.*, u.push_token, u.id as creator_user_id
        FROM clips c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ${clipId}
      `
      return (rows[0] as ClipWithUser) ?? null
    },

    async getReceiptById(receiptId: string): Promise<Receipt | null> {
      const rows = await sql`SELECT * FROM receipts WHERE id = ${receiptId}`
      return (rows[0] as Receipt) ?? null
    },

    async createReceipt(productIds: string[]): Promise<Receipt> {
      const rows = await sql`
        INSERT INTO receipts (product_ids)
        VALUES (${productIds})
        RETURNING *
      `
      return rows[0] as Receipt
    },

    async markReceiptUsed(receiptId: string): Promise<void> {
      await sql`UPDATE receipts SET used_for_conversions = TRUE WHERE id = ${receiptId}`
    },

    async processConversionReward(input: ProcessConversionInput): Promise<ProcessConversionResult> {
      const [rows] = await sql.transaction([
        sql`
          WITH clip_row AS (
            SELECT
              c.id AS clip_id,
              c.user_id AS creator_user_id,
              c.created_at AS clip_created_at,
              u.push_token AS push_token
            FROM clips c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ${input.clip_id}
          ),
          inserted_conversion AS (
            INSERT INTO conversions (order_id, clip_id, user_id)
            SELECT ${input.order_id}, clip_id, creator_user_id
            FROM clip_row
            ON CONFLICT (order_id) DO NOTHING
            RETURNING id, clip_id, user_id
          ),
          updated_clip AS (
            UPDATE clips
            SET conversions = conversions + 1
            WHERE id IN (SELECT clip_id FROM inserted_conversion)
            RETURNING id
          ),
          inserted_reward AS (
            INSERT INTO reward_transactions (
              user_id,
              clip_id,
              conversion_id,
              order_id,
              type,
              amount_cents,
              idempotency_key
            )
            SELECT
              ic.user_id,
              ic.clip_id,
              ic.id,
              ${input.order_id},
              'conversion',
              ${input.reward_cents},
              'conversion:' || ic.id::text
            FROM inserted_conversion ic
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING *
          ),
          updated_user AS (
            UPDATE users
            SET earnings = earnings + ${input.reward_cents}
            WHERE id IN (SELECT user_id FROM inserted_reward)
            RETURNING id
          )
          SELECT
            EXISTS(SELECT 1 FROM clip_row) AS clip_found,
            EXISTS(SELECT 1 FROM inserted_conversion) AS conversion_recorded,
            EXISTS(SELECT 1 FROM inserted_reward) AS reward_credited,
            (SELECT row_to_json(ir) FROM inserted_reward ir LIMIT 1) AS reward_transaction,
            (SELECT creator_user_id FROM clip_row LIMIT 1) AS creator_user_id,
            (SELECT clip_id FROM clip_row LIMIT 1) AS clip_id,
            (SELECT push_token FROM clip_row LIMIT 1) AS push_token,
            COALESCE((SELECT clip_created_at >= (NOW() - INTERVAL '8 hours') FROM clip_row LIMIT 1), FALSE) AS within_window
        `,
      ])

      const row = rows[0] as
        | {
            clip_found: boolean
            conversion_recorded: boolean
            reward_credited: boolean
            reward_transaction: unknown
            creator_user_id: string | null
            clip_id: string | null
            push_token: string | null
            within_window: boolean
          }
        | undefined

      if (!row || !row.clip_found || !row.creator_user_id || !row.clip_id) {
        return { status: "clip_not_found" }
      }

      return {
        status: "ok",
        clip_id: row.clip_id,
        creator_user_id: row.creator_user_id,
        push_token: row.push_token,
        conversion_recorded: row.conversion_recorded,
        reward_credited: row.reward_credited,
        reward_transaction: parseJsonRow<RewardTransaction>(row.reward_transaction),
        within_window: row.within_window,
      }
    },

    async ensureCreatorWallet(userId: string): Promise<CreatorWallet> {
      const existing = await sql`
        SELECT *
        FROM creator_wallets
        WHERE user_id = ${userId}
        LIMIT 1
      `
      if (existing[0]) {
        return existing[0] as CreatorWallet
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const walletCode = generateWalletCode()

        try {
          const inserted = await sql`
            INSERT INTO creator_wallets (user_id, wallet_code, qr_payload)
            VALUES (${userId}, ${walletCode}, ${walletCode})
            ON CONFLICT (user_id) DO NOTHING
            RETURNING *
          `

          if (inserted[0]) {
            return inserted[0] as CreatorWallet
          }

          const raced = await sql`
            SELECT *
            FROM creator_wallets
            WHERE user_id = ${userId}
            LIMIT 1
          `
          if (raced[0]) {
            return raced[0] as CreatorWallet
          }
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error
          }
        }
      }

      const fallbackCode = `CLIP-${userId.replace(/-/g, "").toUpperCase()}`
      try {
        const inserted = await sql`
          INSERT INTO creator_wallets (user_id, wallet_code, qr_payload)
          VALUES (${userId}, ${fallbackCode}, ${fallbackCode})
          ON CONFLICT (user_id) DO NOTHING
          RETURNING *
        `
        if (inserted[0]) {
          return inserted[0] as CreatorWallet
        }
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error
        }
      }

      const finalRow = await sql`
        SELECT *
        FROM creator_wallets
        WHERE user_id = ${userId}
        LIMIT 1
      `

      if (!finalRow[0]) {
        throw new Error("Failed to ensure creator wallet")
      }

      return finalRow[0] as CreatorWallet
    },

    async getCreatorWalletByUserId(userId: string): Promise<CreatorWallet | null> {
      const rows = await sql`
        SELECT *
        FROM creator_wallets
        WHERE user_id = ${userId}
        LIMIT 1
      `
      return (rows[0] as CreatorWallet) ?? null
    },

    async getCreatorWalletByCode(walletCode: string): Promise<CreatorWallet | null> {
      const rows = await sql`
        SELECT *
        FROM creator_wallets
        WHERE wallet_code = ${walletCode}
        LIMIT 1
      `
      return (rows[0] as CreatorWallet) ?? null
    },

    async updateCreatorWalletPassUrl(walletId: string, passUrl: string): Promise<CreatorWallet | null> {
      const rows = await sql`
        UPDATE creator_wallets
        SET pass_url = ${passUrl}
        WHERE id = ${walletId}
        RETURNING *
      `
      return (rows[0] as CreatorWallet) ?? null
    },

    async getRewardBalances(userId: string): Promise<RewardBalances> {
      return readRewardBalances(userId)
    },

    async getRewardTransactionsByUserId(userId: string, limit = 20): Promise<RewardTransaction[]> {
      const normalizedLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(100, Math.floor(limit)))
        : 20

      const rows = await sql`
        SELECT *
        FROM reward_transactions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${normalizedLimit}
      `
      return rows as RewardTransaction[]
    },

    async redeemWallet(input: RedeemWalletInput): Promise<RedeemWalletResult> {
      const idempotencyKey = walletRedeemIdempotencyKey(input.wallet_code, input.order_id)

      const [rows] = await sql.transaction([
        sql`
          WITH wallet_row AS (
            SELECT *
            FROM creator_wallets
            WHERE wallet_code = ${input.wallet_code}
            FOR UPDATE
          ),
          existing_tx AS (
            SELECT *
            FROM reward_transactions
            WHERE idempotency_key = ${idempotencyKey}
            LIMIT 1
          ),
          balance_row AS (
            SELECT COALESCE(SUM(amount_cents), 0)::INT AS available_cents
            FROM reward_transactions
            WHERE user_id = (SELECT user_id FROM wallet_row)
          ),
          inserted_tx AS (
            INSERT INTO reward_transactions (
              user_id,
              order_id,
              type,
              amount_cents,
              idempotency_key
            )
            SELECT
              wr.user_id,
              ${input.order_id},
              'wallet_redeem',
              ${-Math.abs(input.amount_cents)},
              ${idempotencyKey}
            FROM wallet_row wr
            WHERE NOT EXISTS (SELECT 1 FROM existing_tx)
              AND (SELECT available_cents FROM balance_row) >= ${input.amount_cents}
            RETURNING *
          ),
          updated_user AS (
            UPDATE users
            SET earnings = earnings - ${input.amount_cents}
            WHERE id IN (SELECT user_id FROM inserted_tx)
            RETURNING id
          ),
          result_tx AS (
            SELECT * FROM inserted_tx
            UNION ALL
            SELECT * FROM existing_tx
          )
          SELECT
            EXISTS(SELECT 1 FROM wallet_row) AS wallet_found,
            EXISTS(SELECT 1 FROM existing_tx) AS already_processed,
            EXISTS(SELECT 1 FROM inserted_tx) AS debited,
            COALESCE((SELECT available_cents FROM balance_row), 0)::INT AS available_before_cents,
            (SELECT row_to_json(wr) FROM wallet_row wr LIMIT 1) AS wallet,
            (SELECT row_to_json(rt) FROM result_tx rt LIMIT 1) AS reward_transaction
        `,
      ])

      const row = rows[0] as
        | {
            wallet_found: boolean
            already_processed: boolean
            debited: boolean
            available_before_cents: number
            wallet: unknown
            reward_transaction: unknown
          }
        | undefined

      const wallet = parseJsonRow<CreatorWallet>(row?.wallet)
      if (!row || !row.wallet_found || !wallet) {
        return { status: "wallet_not_found" }
      }

      const rewardTransaction = parseJsonRow<RewardTransaction>(row.reward_transaction)

      if (row.already_processed && rewardTransaction) {
        const balances = await readRewardBalances(wallet.user_id)
        return {
          status: "already_processed",
          wallet,
          reward_transaction: rewardTransaction,
          balances,
        }
      }

      if (!row.debited || !rewardTransaction) {
        return {
          status: "insufficient_balance",
          wallet,
          available_cents: row.available_before_cents,
        }
      }

      const balances = await readRewardBalances(wallet.user_id)
      return {
        status: "redeemed",
        wallet,
        reward_transaction: rewardTransaction,
        balances,
      }
    },

    async getCouponsByUserId(userId: string): Promise<Coupon[]> {
      const rows = await sql`
        SELECT *
        FROM coupons
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `
      return rows as Coupon[]
    },

    async getCouponByCode(userId: string, code: string): Promise<Coupon | null> {
      const rows = await sql`
        SELECT *
        FROM coupons
        WHERE user_id = ${userId}
          AND code = ${code}
        LIMIT 1
      `
      return (rows[0] as Coupon) ?? null
    },

    async redeemCouponByCode(userId: string, code: string): Promise<Coupon | null> {
      const rows = await sql`
        UPDATE coupons
        SET redeemed = TRUE,
            redeemed_at = NOW()
        WHERE user_id = ${userId}
          AND code = ${code}
          AND redeemed = FALSE
          AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING *
      `
      return (rows[0] as Coupon) ?? null
    },

    async updateCouponWalletPassUrl(couponId: string, walletPassUrl: string): Promise<Coupon | null> {
      const rows = await sql`
        UPDATE coupons
        SET wallet_pass_url = ${walletPassUrl}
        WHERE id = ${couponId}
        RETURNING *
      `
      return (rows[0] as Coupon) ?? null
    },

    async getAvailableCouponTotals(userId: string): Promise<{ available_cents: number }> {
      const rows = await sql`
        SELECT COALESCE(SUM(value_cents), 0)::INT AS available_cents
        FROM coupons
        WHERE user_id = ${userId}
          AND redeemed = FALSE
          AND (expires_at IS NULL OR expires_at > NOW())
      `
      return (rows[0] as { available_cents: number }) ?? { available_cents: 0 }
    },
  }
}
