import { afterEach, describe, expect, mock, test } from "bun:test"
import { Hono } from "hono"
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
import { clipsRoutes } from "../src/routes/clips"
import { conversionsRoutes } from "../src/routes/conversions"
import { couponsRoutes } from "../src/routes/coupons"
import { receiptsRoutes } from "../src/routes/receipts"
import { rewardsRoutes } from "../src/routes/rewards"
import { uploadRoutes } from "../src/routes/upload"
import type { Env } from "../src/types"

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    VIDEOS: {
      put: mock(() => Promise.resolve({})),
      get: mock(() => Promise.resolve(null)),
      delete: mock(() => Promise.resolve()),
    } as unknown as R2Bucket,
    DATABASE_URL: "mock://db",
    SHOPIFY_WEBHOOK_SECRET: "test-secret",
    APNS_KEY_ID: undefined,
    APNS_TEAM_ID: undefined,
    APNS_PRIVATE_KEY: undefined,
    WALLET_PASS_TYPE_ID: undefined,
    WALLET_TEAM_ID: undefined,
    WALLET_CERT: undefined,
    WALLET_CERT_PASSWORD: undefined,
    WALLETWALLET_API_KEY: undefined,
    WALLETWALLET_BASE_URL: "https://walletwallet.example",
    WALLETWALLET_TEMPLATE_ID: undefined,
    ...overrides,
  }
}

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
      if (!receipt) {
        return { status: "receipt_not_found" }
      }
      if (receipt.clip_created) {
        return { status: "receipt_already_used" }
      }
      if (!receipt.product_ids.includes(input.product_id)) {
        return { status: "product_not_in_receipt" }
      }

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

      return {
        status: "created",
        clip,
        coupon,
      }
    },

    async incrementClipConversions(clipId: string) {
      const clip = clips.get(clipId)
      if (clip) clip.conversions += 1
    },

    async getClipWithUser(clipId: string) {
      const clip = clips.get(clipId)
      if (!clip) return null
      const user = users.get(clip.user_id)
      const result: ClipWithUser = {
        ...clip,
        push_token: user?.push_token ?? null,
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
      if (receipt) {
        receipt.used_for_conversions = true
      }
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

      const bonusCoupon: Coupon = {
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
      coupons.set(bonusCoupon.id, bonusCoupon)

      return {
        conversion_recorded: true,
        bonus_coupon_created: true,
        bonus_coupon: bonusCoupon,
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
        .reduce((total, coupon) => total + coupon.value_cents, 0)

      return { available_cents: available }
    },
  }
}

function buildApp(db: Db) {
  const app = new Hono<{ Bindings: Env }>()
  app.route("/clips", clipsRoutes(db))
  app.route("/receipt", receiptsRoutes(db))
  app.route("/conversions", conversionsRoutes(db))
  app.route("/rewards", rewardsRoutes(db))
  app.route("/coupons", couponsRoutes(db))
  app.route("/upload", uploadRoutes())
  app.route("/upload-url", uploadRoutes())
  return app
}

async function signWebhookBody(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("Coupon-first rewards API", () => {
  test("issues instant coupon on clip creation and marks receipt used", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const receipt = await db.createReceipt(["product-123"])
    const response = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-clip-creator",
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          product_id: "product-123",
          video_url: "https://videos.clipstakes.app/clips/new.mp4",
          text_overlay: "Hello",
          text_position: "bottom",
          duration_seconds: 12,
        }),
      },
      env
    )

    expect(response.status).toBe(201)
    const body = await response.json()

    expect(body.clip).toHaveProperty("id")
    expect(body.instant_coupon.value_cents).toBe(500)
    expect(body.instant_coupon.type).toBe("instant")
    expect(body.instant_coupon.wallet_pass_url).toBeNull()
    expect(body.totals.available_cents).toBe(500)
    expect(body.totals.available_display).toBe("$5.00")

    const receiptResponse = await app.request(`/receipt/${receipt.id}`, undefined, env)
    const receiptBody = await receiptResponse.json()
    expect(receiptBody.clip_created).toBe(true)
  })

  test("rejects duplicate clip creation for the same receipt", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const receipt = await db.createReceipt(["product-123"])
    const payload = JSON.stringify({
      receipt_id: receipt.id,
      product_id: "product-123",
      video_url: "https://videos.clipstakes.app/clips/new.mp4",
    })

    const first = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-clip-creator",
        },
        body: payload,
      },
      env
    )
    expect(first.status).toBe(201)

    const second = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-clip-creator",
        },
        body: payload,
      },
      env
    )

    expect(second.status).toBe(409)
  })

  test("first conversion creates one bonus coupon and later conversions do not", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const receipt = await db.createReceipt(["product-123"])
    const createRes = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-bonus",
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          product_id: "product-123",
          video_url: "https://videos.clipstakes.app/clips/new.mp4",
        }),
      },
      env
    )
    const clip = (await createRes.json()).clip as { id: string }

    const conversionOne = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_id: clip.id,
          order_id: "order-1",
        }),
      },
      env
    )
    const conversionOneBody = await conversionOne.json()
    expect(conversionOne.status).toBe(200)
    expect(conversionOneBody.bonus_coupon_created).toBe(true)

    const conversionTwo = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_id: clip.id,
          order_id: "order-2",
        }),
      },
      env
    )
    const conversionTwoBody = await conversionTwo.json()
    expect(conversionTwo.status).toBe(200)
    expect(conversionTwoBody.bonus_coupon_created).toBe(false)

    const rewardsResponse = await app.request(
      "/rewards/me",
      {
        method: "GET",
        headers: { "X-Device-ID": "device-bonus" },
      },
      env
    )
    const rewardsBody = await rewardsResponse.json()
    const bonusCoupons = rewardsBody.coupons.filter((coupon: { type: string }) => coupon.type === "bonus")
    expect(bonusCoupons.length).toBe(1)
  })

  test("/rewards/me returns coupons and totals", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const receipt = await db.createReceipt(["product-123"])
    const createRes = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-rewards",
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          product_id: "product-123",
          video_url: "https://videos.clipstakes.app/clips/rewards.mp4",
        }),
      },
      env
    )
    const clip = (await createRes.json()).clip as { id: string }

    await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_id: clip.id,
          order_id: "order-rewards-1",
        }),
      },
      env
    )

    const rewardsResponse = await app.request(
      "/rewards/me",
      {
        method: "GET",
        headers: { "X-Device-ID": "device-rewards" },
      },
      env
    )

    expect(rewardsResponse.status).toBe(200)
    const rewardsBody = await rewardsResponse.json()
    expect(rewardsBody.coupons.length).toBe(2)
    expect(rewardsBody.totals.available_cents).toBe(1000)
    expect(rewardsBody.totals.available_display).toBe("$10.00")
  })

  test("/conversions and /conversions/dev use the same attribution + bonus logic", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const receiptA = await db.createReceipt(["product-a"])
    const receiptB = await db.createReceipt(["product-b"])

    const clipA = (
      await (
        await app.request(
          "/clips",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Device-ID": "device-conv",
            },
            body: JSON.stringify({
              receipt_id: receiptA.id,
              product_id: "product-a",
              video_url: "https://videos.clipstakes.app/clips/a.mp4",
            }),
          },
          env
        )
      ).json()
    ).clip as { id: string }

    const clipB = (
      await (
        await app.request(
          "/clips",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Device-ID": "device-conv",
            },
            body: JSON.stringify({
              receipt_id: receiptB.id,
              product_id: "product-b",
              video_url: "https://videos.clipstakes.app/clips/b.mp4",
            }),
          },
          env
        )
      ).json()
    ).clip as { id: string }

    const devRes = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_id: clipA.id,
          order_id: "order-dev",
        }),
      },
      env
    )
    const devBody = await devRes.json()
    expect(devBody.bonus_coupon_created).toBe(true)

    const webhookPayload = JSON.stringify({
      id: 1024,
      order_number: 1024,
      note_attributes: [{ name: "clip_id", value: clipB.id }],
      line_items: [],
      customer: { id: 1, email: "test@example.com" },
    })
    const signature = await signWebhookBody(webhookPayload, env.SHOPIFY_WEBHOOK_SECRET)
    const webhookRes = await app.request(
      "/conversions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Hmac-Sha256": signature,
        },
        body: webhookPayload,
      },
      env
    )
    const webhookBody = await webhookRes.json()
    expect(webhookRes.status).toBe(200)
    expect(webhookBody.attributed).toBe(true)
    expect(webhookBody.bonus_coupon_created).toBe(true)
  })

  test("WalletWallet failures do not fail clip creation", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "quota exceeded" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        })
      )
    ) as unknown as typeof fetch

    const env = createMockEnv({
      WALLETWALLET_API_KEY: "server-secret",
      WALLETWALLET_TEMPLATE_ID: "template-123",
      WALLETWALLET_BASE_URL: "https://walletwallet.example",
    })

    const receipt = await db.createReceipt(["product-123"])
    const response = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-wallet-fallback",
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          product_id: "product-123",
          video_url: "https://videos.clipstakes.app/clips/new.mp4",
        }),
      },
      env
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.instant_coupon.wallet_pass_url).toBeNull()
  })
})

describe("Upload aliases", () => {
  test("supports both /upload and /upload-url", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const uploadResponse = await app.request("/upload", { method: "POST" }, env)
    const uploadUrlResponse = await app.request("/upload-url", { method: "POST" }, env)

    expect(uploadResponse.status).toBe(200)
    expect(uploadUrlResponse.status).toBe(200)

    const uploadBody = await uploadResponse.json()
    const uploadUrlBody = await uploadUrlResponse.json()
    expect(uploadBody).toHaveProperty("upload_url")
    expect(uploadUrlBody).toHaveProperty("upload_url")
  })
})
