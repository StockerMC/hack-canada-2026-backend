import { describe, expect, test } from "bun:test"
import type {
  Clip,
  ClipWithCreator,
  ClipWithUser,
  Coupon,
  CreateClipWithReceiptInput,
  CreateClipWithReceiptResult,
  Db,
  ProcessConversionInput,
  ProcessConversionResult,
  Receipt,
  User,
} from "../src/db"

function createInMemoryDb(): Db {
  const users = new Map<string, User>()
  const usersByDeviceId = new Map<string, string>()
  const clips = new Map<string, Clip>()
  const receipts = new Map<string, Receipt>()
  const coupons = new Map<string, Coupon>()
  const processedOrders = new Set<string>()

  const now = () => new Date()
  const couponCodeFromClip = (prefix: "CLIP" | "BONUS", clipId: string) =>
    `${prefix}-${clipId.replace(/-/g, "").toUpperCase()}`

  return {
    async getUserByDeviceId(deviceId: string) {
      const userId = usersByDeviceId.get(deviceId)
      return userId ? (users.get(userId) ?? null) : null
    },

    async createUser(deviceId: string, pushToken: string | null) {
      const user: User = {
        id: crypto.randomUUID(),
        device_id: deviceId,
        push_token: pushToken,
        earnings: 0,
        created_at: now(),
      }
      users.set(user.id, user)
      usersByDeviceId.set(deviceId, user.id)
      return user
    },

    async updateUserPushToken(userId: string, pushToken: string) {
      const user = users.get(userId)
      if (user) user.push_token = pushToken
    },

    async updateUserEarnings(userId: string, amount: number) {
      const user = users.get(userId)
      if (user) user.earnings += amount
    },

    async getUserEarnings(userId: string) {
      const user = users.get(userId)
      return user ? { id: user.id, earnings: user.earnings } : null
    },

    async getClipsByProductId(productId: string) {
      const result: ClipWithCreator[] = Array.from(clips.values())
        .filter((clip) => clip.product_id === productId)
        .sort((a, b) => b.conversions - a.conversions)
        .map((clip) => ({
          ...clip,
          creator_device_id: users.get(clip.user_id)?.device_id ?? "unknown",
        }))
      return result
    },

    async getClipById(clipId: string) {
      return clips.get(clipId) ?? null
    },

    async createClip(userId: string, productId: string, videoUrl: string, options) {
      const clip: Clip = {
        id: crypto.randomUUID(),
        user_id: userId,
        receipt_id: null,
        product_id: productId,
        video_url: videoUrl,
        text_overlay: options?.text_overlay ?? null,
        text_position: options?.text_position ?? null,
        duration_seconds: options?.duration_seconds ?? null,
        conversions: 0,
        created_at: now(),
      }
      clips.set(clip.id, clip)
      return clip
    },

    async createClipWithReceiptAndInstantCoupon(
      input: CreateClipWithReceiptInput
    ): Promise<CreateClipWithReceiptResult> {
      const receipt = receipts.get(input.receipt_id)
      if (!receipt) return { status: "receipt_not_found" }
      if (receipt.clip_created) return { status: "receipt_already_used" }
      if (!receipt.product_ids.includes(input.product_id)) return { status: "product_not_in_receipt" }

      const clip: Clip = {
        id: crypto.randomUUID(),
        user_id: input.user_id,
        receipt_id: receipt.id,
        product_id: input.product_id,
        video_url: input.video_url,
        text_overlay: input.text_overlay ?? null,
        text_position: input.text_position ?? null,
        duration_seconds: input.duration_seconds ?? null,
        conversions: 0,
        created_at: now(),
      }
      clips.set(clip.id, clip)

      receipt.clip_created = true
      receipt.clip_id = clip.id
      receipt.used_for_conversions = true
      receipts.set(receipt.id, receipt)

      const coupon: Coupon = {
        id: crypto.randomUUID(),
        user_id: input.user_id,
        clip_id: clip.id,
        code: couponCodeFromClip("CLIP", clip.id),
        type: "instant",
        value_cents: input.instant_value_cents,
        redeemed: false,
        created_at: now(),
        expires_at: null,
        redeemed_at: null,
        wallet_pass_url: null,
      }
      coupons.set(coupon.id, coupon)

      return { status: "created", clip, coupon }
    },

    async incrementClipConversions(clipId: string) {
      const clip = clips.get(clipId)
      if (clip) clip.conversions += 1
    },

    async getClipWithUser(clipId: string) {
      const clip = clips.get(clipId)
      if (!clip) return null
      const result: ClipWithUser = {
        ...clip,
        push_token: users.get(clip.user_id)?.push_token ?? null,
        creator_user_id: clip.user_id,
      }
      return result
    },

    async getReceiptById(receiptId: string) {
      return receipts.get(receiptId) ?? null
    },

    async createReceipt(productIds: string[]) {
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        product_ids: productIds,
        used_for_conversions: false,
        clip_created: false,
        clip_id: null,
        created_at: now(),
      }
      receipts.set(receipt.id, receipt)
      return receipt
    },

    async markReceiptUsed(receiptId: string) {
      const receipt = receipts.get(receiptId)
      if (receipt) receipt.used_for_conversions = true
    },

    async processConversionAndMaybeBonus(
      input: ProcessConversionInput
    ): Promise<ProcessConversionResult> {
      if (processedOrders.has(input.order_id)) {
        return {
          conversion_recorded: false,
          bonus_coupon_created: false,
          bonus_coupon: null,
        }
      }
      processedOrders.add(input.order_id)

      const clip = clips.get(input.clip_id)
      if (!clip) {
        return {
          conversion_recorded: false,
          bonus_coupon_created: false,
          bonus_coupon: null,
        }
      }
      clip.conversions += 1

      const user = users.get(input.user_id)
      if (user) user.earnings += input.earnings_cents

      const existingBonus = Array.from(coupons.values()).find(
        (coupon) => coupon.type === "bonus" && coupon.clip_id === input.clip_id
      )
      if (existingBonus) {
        return {
          conversion_recorded: true,
          bonus_coupon_created: false,
          bonus_coupon: null,
        }
      }

      const bonus: Coupon = {
        id: crypto.randomUUID(),
        user_id: input.user_id,
        clip_id: input.clip_id,
        code: couponCodeFromClip("BONUS", input.clip_id),
        type: "bonus",
        value_cents: input.bonus_value_cents,
        redeemed: false,
        created_at: now(),
        expires_at: null,
        redeemed_at: null,
        wallet_pass_url: null,
      }
      coupons.set(bonus.id, bonus)

      return {
        conversion_recorded: true,
        bonus_coupon_created: true,
        bonus_coupon: bonus,
      }
    },

    async getCouponsByUserId(userId: string) {
      return Array.from(coupons.values())
        .filter((coupon) => coupon.user_id === userId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    },

    async getCouponByCode(userId: string, code: string) {
      return (
        Array.from(coupons.values()).find(
          (coupon) => coupon.user_id === userId && coupon.code === code
        ) ?? null
      )
    },

    async redeemCouponByCode(userId: string, code: string) {
      const coupon = Array.from(coupons.values()).find(
        (value) =>
          value.user_id === userId &&
          value.code === code &&
          !value.redeemed &&
          (!value.expires_at || value.expires_at.getTime() > Date.now())
      )
      if (!coupon) return null
      coupon.redeemed = true
      coupon.redeemed_at = now()
      coupons.set(coupon.id, coupon)
      return coupon
    },

    async updateCouponWalletPassUrl(couponId: string, walletPassUrl: string) {
      const coupon = coupons.get(couponId)
      if (!coupon) return null
      coupon.wallet_pass_url = walletPassUrl
      coupons.set(coupon.id, coupon)
      return coupon
    },

    async getAvailableCouponTotals(userId: string) {
      const available = Array.from(coupons.values())
        .filter(
          (coupon) =>
            coupon.user_id === userId &&
            !coupon.redeemed &&
            (!coupon.expires_at || coupon.expires_at.getTime() > Date.now())
        )
        .reduce((sum, coupon) => sum + coupon.value_cents, 0)
      return { available_cents: available }
    },
  }
}

describe("DB reward and conversion behavior", () => {
  test("creates clip + instant coupon and marks receipt as used", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)
    const receipt = await db.createReceipt(["product-1"])

    const result = await db.createClipWithReceiptAndInstantCoupon({
      user_id: user.id,
      receipt_id: receipt.id,
      product_id: "product-1",
      video_url: "https://videos.clipstakes.app/clips/new.mp4",
      instant_value_cents: 500,
    })

    expect(result.status).toBe("created")
    if (result.status !== "created") return

    expect(result.coupon.type).toBe("instant")
    expect(result.coupon.value_cents).toBe(500)

    const updatedReceipt = await db.getReceiptById(receipt.id)
    expect(updatedReceipt?.clip_created).toBe(true)
    expect(updatedReceipt?.clip_id).toBe(result.clip.id)
  })

  test("enforces one clip per receipt", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)
    const receipt = await db.createReceipt(["product-1"])

    const first = await db.createClipWithReceiptAndInstantCoupon({
      user_id: user.id,
      receipt_id: receipt.id,
      product_id: "product-1",
      video_url: "https://videos.clipstakes.app/clips/1.mp4",
      instant_value_cents: 500,
    })
    const second = await db.createClipWithReceiptAndInstantCoupon({
      user_id: user.id,
      receipt_id: receipt.id,
      product_id: "product-1",
      video_url: "https://videos.clipstakes.app/clips/2.mp4",
      instant_value_cents: 500,
    })

    expect(first.status).toBe("created")
    expect(second.status).toBe("receipt_already_used")
  })

  test("dedupes conversions by order and only issues one bonus coupon per clip", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)
    const clip = await db.createClip(user.id, "product-1", "https://videos.clipstakes.app/clips/1.mp4")

    const first = await db.processConversionAndMaybeBonus({
      order_id: "order-1",
      clip_id: clip.id,
      user_id: user.id,
      earnings_cents: 500,
      bonus_value_cents: 500,
    })
    const secondUniqueOrder = await db.processConversionAndMaybeBonus({
      order_id: "order-2",
      clip_id: clip.id,
      user_id: user.id,
      earnings_cents: 500,
      bonus_value_cents: 500,
    })
    const duplicate = await db.processConversionAndMaybeBonus({
      order_id: "order-2",
      clip_id: clip.id,
      user_id: user.id,
      earnings_cents: 500,
      bonus_value_cents: 500,
    })

    expect(first.conversion_recorded).toBe(true)
    expect(first.bonus_coupon_created).toBe(true)
    expect(secondUniqueOrder.conversion_recorded).toBe(true)
    expect(secondUniqueOrder.bonus_coupon_created).toBe(false)
    expect(duplicate.conversion_recorded).toBe(false)
    expect(duplicate.bonus_coupon_created).toBe(false)
  })

  test("redeems coupons and updates available totals", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)
    const receipt = await db.createReceipt(["product-1"])
    const result = await db.createClipWithReceiptAndInstantCoupon({
      user_id: user.id,
      receipt_id: receipt.id,
      product_id: "product-1",
      video_url: "https://videos.clipstakes.app/clips/new.mp4",
      instant_value_cents: 500,
    })

    if (result.status !== "created") {
      throw new Error("Expected instant coupon to be created")
    }

    const before = await db.getAvailableCouponTotals(user.id)
    expect(before.available_cents).toBe(500)

    const redeemed = await db.redeemCouponByCode(user.id, result.coupon.code)
    expect(redeemed?.redeemed).toBe(true)

    const after = await db.getAvailableCouponTotals(user.id)
    expect(after.available_cents).toBe(0)
  })
})
