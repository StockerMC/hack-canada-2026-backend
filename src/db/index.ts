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
  instant_value_cents: number
}

export type CreateClipWithReceiptResult =
  | { status: "receipt_not_found" | "receipt_already_used" | "product_not_in_receipt" }
  | { status: "created"; clip: Clip; coupon: Coupon }

export type ProcessConversionInput = {
  order_id: string
  clip_id: string
  user_id: string
  earnings_cents: number
  bonus_value_cents: number
}

export type ProcessConversionResult = {
  conversion_recorded: boolean
  bonus_coupon_created: boolean
  bonus_coupon: Coupon | null
}

function parseJsonRow<T>(value: unknown): T | null {
  if (!value) return null
  if (typeof value === "string") {
    return JSON.parse(value) as T
  }
  return value as T
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
  createClipWithReceiptAndInstantCoupon(
    input: CreateClipWithReceiptInput
  ): Promise<CreateClipWithReceiptResult>
  incrementClipConversions(clipId: string): Promise<void>
  getClipWithUser(clipId: string): Promise<ClipWithUser | null>
  getReceiptById(receiptId: string): Promise<Receipt | null>
  createReceipt(productIds: string[]): Promise<Receipt>
  markReceiptUsed(receiptId: string): Promise<void>
  processConversionAndMaybeBonus(input: ProcessConversionInput): Promise<ProcessConversionResult>
  getCouponsByUserId(userId: string): Promise<Coupon[]>
  getCouponByCode(userId: string, code: string): Promise<Coupon | null>
  redeemCouponByCode(userId: string, code: string): Promise<Coupon | null>
  updateCouponWalletPassUrl(couponId: string, walletPassUrl: string): Promise<Coupon | null>
  getAvailableCouponTotals(userId: string): Promise<{ available_cents: number }>
}

export function createDb(databaseUrl: string): Db {
  const sql = neon(databaseUrl)

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

    async createClipWithReceiptAndInstantCoupon(
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
              WHEN NOT (${input.product_id} = ANY ((SELECT product_ids FROM receipt_row))) THEN 'product_not_in_receipt'
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
          inserted_coupon AS (
            INSERT INTO coupons (user_id, clip_id, code, type, value_cents)
            SELECT
              ${input.user_id},
              ic.id,
              'CLIP-' || UPPER(REPLACE(ic.id::text, '-', '')),
              'instant',
              ${input.instant_value_cents}
            FROM inserted_clip ic
            RETURNING *
          )
          SELECT
            (SELECT status FROM status_row) AS status,
            (SELECT row_to_json(ic) FROM inserted_clip ic LIMIT 1) AS clip,
            (SELECT row_to_json(cp) FROM inserted_coupon cp LIMIT 1) AS coupon
        `,
      ])

      const row = rows[0] as
        | {
            status: "receipt_not_found" | "receipt_already_used" | "product_not_in_receipt" | "ok"
            clip: unknown
            coupon: unknown
          }
        | undefined

      if (!row) {
        return { status: "receipt_not_found" }
      }

      if (row.status === "receipt_not_found" || row.status === "receipt_already_used" || row.status === "product_not_in_receipt") {
        return { status: row.status }
      }

      const clip = parseJsonRow<Clip>(row.clip)
      const coupon = parseJsonRow<Coupon>(row.coupon)

      if (!clip || !coupon) {
        throw new Error("Failed to create clip and instant coupon transactionally")
      }

      return {
        status: "created",
        clip,
        coupon,
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

    async processConversionAndMaybeBonus(input: ProcessConversionInput): Promise<ProcessConversionResult> {
      const [rows] = await sql.transaction([
        sql`
          WITH inserted_conversion AS (
            INSERT INTO conversion_events (order_id, clip_id, user_id)
            VALUES (${input.order_id}, ${input.clip_id}, ${input.user_id})
            ON CONFLICT (order_id) DO NOTHING
            RETURNING clip_id, user_id
          ),
          updated_clip AS (
            UPDATE clips
            SET conversions = conversions + 1
            WHERE id IN (SELECT clip_id FROM inserted_conversion)
            RETURNING id
          ),
          updated_user AS (
            UPDATE users
            SET earnings = earnings + ${input.earnings_cents}
            WHERE id IN (SELECT user_id FROM inserted_conversion)
            RETURNING id
          ),
          inserted_bonus AS (
            INSERT INTO coupons (user_id, clip_id, code, type, value_cents)
            SELECT
              user_id,
              clip_id,
              'BONUS-' || UPPER(REPLACE(clip_id::text, '-', '')),
              'bonus',
              ${input.bonus_value_cents}
            FROM inserted_conversion
            ON CONFLICT (clip_id) WHERE type = 'bonus' DO NOTHING
            RETURNING *
          )
          SELECT
            EXISTS(SELECT 1 FROM inserted_conversion) AS conversion_recorded,
            EXISTS(SELECT 1 FROM inserted_bonus) AS bonus_coupon_created,
            (SELECT row_to_json(ib) FROM inserted_bonus ib LIMIT 1) AS bonus_coupon
        `,
      ])

      const row = rows[0] as
        | {
            conversion_recorded: boolean
            bonus_coupon_created: boolean
            bonus_coupon: unknown
          }
        | undefined

      if (!row) {
        return {
          conversion_recorded: false,
          bonus_coupon_created: false,
          bonus_coupon: null,
        }
      }

      return {
        conversion_recorded: row.conversion_recorded,
        bonus_coupon_created: row.bonus_coupon_created,
        bonus_coupon: parseJsonRow<Coupon>(row.bonus_coupon),
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
