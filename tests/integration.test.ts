/**
 * Integration tests that test the actual database and full request flow.
 *
 * These tests require a real Neon database connection.
 * Set DATABASE_URL in .env.test or run with:
 *   DATABASE_URL=postgres://... bun test tests/integration.test.ts
 *
 * IMPORTANT: These tests modify the database. Use a test database, not production!
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { createDb, type Db } from "../src/db"
import { Hono } from "hono"
import { clipsRoutes } from "../src/routes/clips"
import { receiptsRoutes } from "../src/routes/receipts"
import { earningsRoutes } from "../src/routes/earnings"

const DATABASE_URL = process.env.DATABASE_URL

// Skip all tests if no database URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb("Integration: Database Operations", () => {
  let db: Db

  beforeAll(() => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL required")
    db = createDb(DATABASE_URL)
  })

  test("creates and retrieves user by device ID", async () => {
    const deviceId = `test-device-${Date.now()}`

    // Create user
    const created = await db.createUser(deviceId, null)
    expect(created.device_id).toBe(deviceId)
    expect(created.id).toBeTruthy()

    // Retrieve user
    const found = await db.getUserByDeviceId(deviceId)
    expect(found).not.toBeNull()
    expect(found?.id).toBe(created.id)
  })

  test("creates clip and retrieves by product ID", async () => {
    const deviceId = `test-device-${Date.now()}`
    const productId = `test-product-${Date.now()}`

    const user = await db.createUser(deviceId, null)
    const clip = await db.createClip(user.id, productId, "https://example.com/test.mp4")

    expect(clip.product_id).toBe(productId)
    expect(clip.conversions).toBe(0)

    const clips = await db.getClipsByProductId(productId)
    expect(clips.length).toBeGreaterThanOrEqual(1)
    expect(clips.some(c => c.id === clip.id)).toBe(true)
  })

  test("increments clip conversions", async () => {
    const deviceId = `test-device-${Date.now()}`
    const productId = `test-product-${Date.now()}`

    const user = await db.createUser(deviceId, null)
    const clip = await db.createClip(user.id, productId, "https://example.com/test.mp4")

    await db.incrementClipConversions(clip.id)
    await db.incrementClipConversions(clip.id)

    const updated = await db.getClipById(clip.id)
    expect(updated?.conversions).toBe(2)
  })

  test("updates user earnings", async () => {
    const deviceId = `test-device-${Date.now()}`

    const user = await db.createUser(deviceId, null)
    expect(user.earnings).toBe(0)

    await db.updateUserEarnings(user.id, 500)
    await db.updateUserEarnings(user.id, 300)

    const earnings = await db.getUserEarnings(user.id)
    expect(earnings?.earnings).toBe(800)
  })

  test("creates and retrieves receipt", async () => {
    const productIds = [`product-${Date.now()}-1`, `product-${Date.now()}-2`]

    const receipt = await db.createReceipt(productIds)
    expect(receipt.product_ids).toEqual(productIds)
    expect(receipt.used_for_conversions).toBe(false)

    const found = await db.getReceiptById(receipt.id)
    expect(found).not.toBeNull()
    expect(found?.product_ids).toEqual(productIds)
  })

  test("marks receipt as used", async () => {
    const receipt = await db.createReceipt([`product-${Date.now()}`])

    await db.markReceiptUsed(receipt.id)

    const found = await db.getReceiptById(receipt.id)
    expect(found?.used_for_conversions).toBe(true)
  })
})

describeWithDb("Integration: Full API Flow", () => {
  let db: Db
  let app: Hono

  beforeAll(() => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL required")
    db = createDb(DATABASE_URL)

    app = new Hono()
    app.route("/clips", clipsRoutes(db))
    app.route("/receipt", receiptsRoutes(db))
    app.route("/earnings", earningsRoutes(db))
  })

  test("full clip creation flow", async () => {
    const deviceId = `integration-test-${Date.now()}`
    const productId = `integration-product-${Date.now()}`

    // 1. Create a clip via API
    const createRes = await app.request("/clips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        product_id: productId,
        video_url: "https://example.com/integration-test.mp4",
      }),
    })

    expect(createRes.status).toBe(201)
    const { clip } = await createRes.json()
    expect(clip.product_id).toBe(productId)

    // 2. Retrieve clips for product via API
    const getRes = await app.request(`/clips/${productId}`)
    expect(getRes.status).toBe(200)

    const { clips } = await getRes.json()
    expect(clips.some((c: any) => c.id === clip.id)).toBe(true)

    // 3. Check user was created and can get earnings
    const user = await db.getUserByDeviceId(deviceId)
    expect(user).not.toBeNull()

    const earningsRes = await app.request(`/earnings/${user!.id}`)
    expect(earningsRes.status).toBe(200)

    const earnings = await earningsRes.json()
    expect(earnings.earnings_cents).toBe(0)
  })

  test("clip creation reuses existing user", async () => {
    const deviceId = `reuse-test-${Date.now()}`
    const productId = `reuse-product-${Date.now()}`

    // Create first clip
    await app.request("/clips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        product_id: productId,
        video_url: "https://example.com/clip1.mp4",
      }),
    })

    const userAfterFirst = await db.getUserByDeviceId(deviceId)

    // Create second clip with same device
    await app.request("/clips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        product_id: productId,
        video_url: "https://example.com/clip2.mp4",
      }),
    })

    const userAfterSecond = await db.getUserByDeviceId(deviceId)

    // Should be same user
    expect(userAfterFirst?.id).toBe(userAfterSecond?.id)
  })

  test("earnings update reflects in API", async () => {
    const deviceId = `earnings-test-${Date.now()}`

    // Create user via clip creation
    await app.request("/clips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        product_id: "any-product",
        video_url: "https://example.com/test.mp4",
      }),
    })

    const user = await db.getUserByDeviceId(deviceId)

    // Add earnings directly to DB
    await db.updateUserEarnings(user!.id, 1500)

    // Check via API
    const res = await app.request(`/earnings/${user!.id}`)
    const earnings = await res.json()

    expect(earnings.earnings_cents).toBe(1500)
    expect(earnings.earnings_dollars).toBe("15.00")
  })
})

// Run only if explicitly requested with DATABASE_URL
if (!DATABASE_URL) {
  test.skip("Integration tests skipped - set DATABASE_URL to run", () => {})
}
