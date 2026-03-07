import { afterEach, describe, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { clipsRoutes } from "../src/routes/clips"
import { conversionsRoutes } from "../src/routes/conversions"
import { receiptsRoutes } from "../src/routes/receipts"
import { rewardsRoutes } from "../src/routes/rewards"
import { uploadRoutes } from "../src/routes/upload"
import { walletRoutes } from "../src/routes/wallet"
import type { Env } from "../src/types"
import type { Db } from "../src/db"
import { createInMemoryDb } from "./helpers/inMemoryDb"

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

function buildApp(db: Db) {
  const app = new Hono<{ Bindings: Env }>()
  app.route("/clips", clipsRoutes(db))
  app.route("/receipt", receiptsRoutes(db))
  app.route("/conversions", conversionsRoutes(db))
  app.route("/rewards", rewardsRoutes(db))
  app.route("/wallet", walletRoutes(db))
  app.route("/upload", uploadRoutes())
  app.route("/upload-url", uploadRoutes())
  return app
}

async function createClipWithReceipt(
  app: Hono,
  env: Env,
  db: Db,
  deviceId: string,
  productId: string
): Promise<{ clipId: string; walletCode: string }> {
  const receipt = await db.createReceipt([productId])

  const response = await app.request(
    "/clips",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        receipt_id: receipt.id,
        product_id: productId,
        video_url: "https://videos.clipstakes.app/clips/new.mp4",
      }),
    },
    env
  )

  expect(response.status).toBe(201)
  const body = await response.json()

  return {
    clipId: body.clip.id as string,
    walletCode: body.wallet.wallet_code as string,
  }
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

describe("Wallet ledger API", () => {
  test("clip creation credits +500 once for one receipt", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const receipt = await db.createReceipt(["product-123"])

    const first = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-clip-credit",
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          product_id: "product-123",
          video_url: "https://videos.clipstakes.app/clips/new.mp4",
        }),
      },
      env
    )

    expect(first.status).toBe(201)
    const firstBody = await first.json()
    expect(firstBody.reward.credited_cents).toBe(500)
    expect(firstBody.reward.reason).toBe("clip_published")
    expect(firstBody.balances.available_cents).toBe(500)
    expect(firstBody.wallet.wallet_code).toMatch(/^CLIP-/)

    const second = await app.request(
      "/clips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "device-clip-credit",
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          product_id: "product-123",
          video_url: "https://videos.clipstakes.app/clips/new-2.mp4",
        }),
      },
      env
    )

    expect(second.status).toBe(409)

    const rewards = await app.request(
      "/rewards/me",
      {
        method: "GET",
        headers: { "X-Device-ID": "device-clip-credit" },
      },
      env
    )
    const rewardsBody = await rewards.json()
    expect(rewardsBody.balances.available_cents).toBe(500)
  })

  test("every unique conversion credits +500", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const { clipId } = await createClipWithReceipt(app, env, db, "device-conv-unique", "product-1")

    const conversionOne = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-1" }),
      },
      env
    )
    const conversionOneBody = await conversionOne.json()

    const conversionTwo = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-2" }),
      },
      env
    )
    const conversionTwoBody = await conversionTwo.json()

    expect(conversionOneBody.reward.credited_cents).toBe(500)
    expect(conversionTwoBody.reward.credited_cents).toBe(500)
    expect(conversionTwoBody.balances.available_cents).toBe(1500)
  })

  test("repeating same order_id does not double-credit", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const { clipId } = await createClipWithReceipt(app, env, db, "device-conv-dedupe", "product-1")

    const first = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-same" }),
      },
      env
    )

    const second = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-same" }),
      },
      env
    )

    const firstBody = await first.json()
    const secondBody = await second.json()

    expect(firstBody.reward.credited_cents).toBe(500)
    expect(secondBody.reward.credited_cents).toBe(0)
    expect(secondBody.balances.available_cents).toBe(1000)
  })

  test("post-8h conversion still credits but within_window is false", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const { clipId } = await createClipWithReceipt(app, env, db, "device-8h", "product-1")
    const clip = await db.getClipById(clipId)
    if (!clip) throw new Error("Clip missing")

    clip.created_at = new Date(Date.now() - 9 * 60 * 60 * 1000)

    const conversion = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-post-8h" }),
      },
      env
    )

    const conversionBody = await conversion.json()
    expect(conversionBody.reward.credited_cents).toBe(500)
    expect(conversionBody.push.within_window).toBe(false)
    expect(conversionBody.push.sent).toBe(false)
  })

  test("push is sent only within 8h window", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)

    globalThis.fetch = mock(() => Promise.resolve(new Response("", { status: 200 }))) as unknown as typeof fetch

    const env = createMockEnv({
      APNS_KEY_ID: "kid",
      APNS_TEAM_ID: "team",
      APNS_PRIVATE_KEY:
        "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR0hBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJHMHdhd0lCQVFRZ3ZtcGNTWWdSMlUwRDE4ZksKaFNvUUMrKzFSNUt5NmFWMTF2dlIra2J3WDAraFJBTkNBQVF1Skp0THpiM1kyY01IRGR0SDV1RmJSeHpNRHE4NwpOSjV6MEx5eUlVaGpqUFd3cjNraWNuZTd6dnF4TkhjZ2xzR0pXckd5TzZnSUtXQ283OWZMcUN5egotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg==",
    })

    const { clipId } = await createClipWithReceipt(app, env, db, "device-push", "product-1")

    const user = await db.getUserByDeviceId("device-push")
    if (!user) throw new Error("User missing")
    await db.updateUserPushToken(user.id, "push-token-1")

    const withinWindow = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-push-window" }),
      },
      env
    )

    const clip = await db.getClipById(clipId)
    if (!clip) throw new Error("Clip missing")
    clip.created_at = new Date(Date.now() - 9 * 60 * 60 * 1000)

    const outsideWindow = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-push-late" }),
      },
      env
    )

    const withinBody = await withinWindow.json()
    const outsideBody = await outsideWindow.json()

    expect(withinBody.push.within_window).toBe(true)
    expect(withinBody.push.sent).toBe(true)
    expect(outsideBody.push.within_window).toBe(false)
    expect(outsideBody.push.sent).toBe(false)
  })

  test("/rewards/me returns wallet identity, balances, and transactions", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const { clipId, walletCode } = await createClipWithReceipt(
      app,
      env,
      db,
      "device-rewards-me",
      "product-1"
    )

    await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-rewards-me" }),
      },
      env
    )

    const response = await app.request(
      "/rewards/me",
      {
        method: "GET",
        headers: { "X-Device-ID": "device-rewards-me" },
      },
      env
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.wallet.wallet_code).toBe(walletCode)
    expect(body.balances.available_cents).toBe(1000)
    expect(body.balances.lifetime_earned_cents).toBe(1000)
    expect(Array.isArray(body.transactions)).toBe(true)
    expect(body.transactions.length).toBeGreaterThanOrEqual(2)
    expect(body.transactions[0]).toHaveProperty("amount_display")
  })

  test("/wallet/redeem debits balance, is idempotent, and blocks overdraft", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const { walletCode } = await createClipWithReceipt(app, env, db, "device-redeem", "product-1")

    const redeem = await app.request(
      "/wallet/redeem",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_code: walletCode,
          amount_cents: 300,
          order_id: "pos-1",
        }),
      },
      env
    )

    const redeemBody = await redeem.json()
    expect(redeem.status).toBe(200)
    expect(redeemBody.balances.available_cents).toBe(200)

    const redeemRetry = await app.request(
      "/wallet/redeem",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_code: walletCode,
          amount_cents: 300,
          order_id: "pos-1",
        }),
      },
      env
    )

    const retryBody = await redeemRetry.json()
    expect(redeemRetry.status).toBe(200)
    expect(retryBody.idempotent).toBe(true)
    expect(retryBody.balances.available_cents).toBe(200)

    const overdraft = await app.request(
      "/wallet/redeem",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_code: walletCode,
          amount_cents: 999,
          order_id: "pos-2",
        }),
      },
      env
    )

    expect(overdraft.status).toBe(409)
  })

  test("/conversions and /conversions/dev share attribution + credit logic", async () => {
    const db = createInMemoryDb()
    const app = buildApp(db)
    const env = createMockEnv()

    const { clipId } = await createClipWithReceipt(app, env, db, "device-conv-paths", "product-1")

    const devResponse = await app.request(
      "/conversions/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, order_id: "order-dev" }),
      },
      env
    )

    const webhookPayload = JSON.stringify({
      id: 2002,
      order_number: 2002,
      note_attributes: [{ name: "clip_id", value: clipId }],
      line_items: [],
      customer: { id: 1, email: "test@example.com" },
    })

    const signature = await signWebhookBody(webhookPayload, env.SHOPIFY_WEBHOOK_SECRET)
    const webhookResponse = await app.request(
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

    const devBody = await devResponse.json()
    const webhookBody = await webhookResponse.json()

    expect(devBody.reward.credited_cents).toBe(500)
    expect(webhookBody.reward.credited_cents).toBe(500)
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
