import { Hono } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db, Coupon } from "../db"

const redeemCouponSchema = z.object({
  code: z.string().min(1),
})

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function mapCoupon(coupon: Coupon) {
  return {
    code: coupon.code,
    value_cents: coupon.value_cents,
    value_display: formatCents(coupon.value_cents),
    type: coupon.type,
    source_clip_id: coupon.clip_id,
    created_at: coupon.created_at,
    expires_at: coupon.expires_at,
    redeemed: coupon.redeemed,
    wallet_pass_url: coupon.wallet_pass_url,
  }
}

export function couponsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  app.post("/redeem", async (c) => {
    const deviceId = c.req.header("X-Device-ID")
    if (!deviceId) {
      return c.json({ error: "X-Device-ID header required" }, 401)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid request body" }, 400)
    }

    const parsed = redeemCouponSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
    }

    const user = await db.getUserByDeviceId(deviceId)
    if (!user) {
      return c.json({ error: "Coupon not found" }, 404)
    }

    const existing = await db.getCouponByCode(user.id, parsed.data.code)
    if (!existing) {
      return c.json({ error: "Coupon not found" }, 404)
    }
    if (existing.redeemed) {
      return c.json({ error: "Coupon already redeemed" }, 409)
    }
    if (existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now()) {
      return c.json({ error: "Coupon expired" }, 409)
    }

    const redeemed = await db.redeemCouponByCode(user.id, parsed.data.code)
    if (!redeemed) {
      return c.json({ error: "Coupon already redeemed" }, 409)
    }

    const totals = await db.getAvailableCouponTotals(user.id)

    return c.json({
      coupon: mapCoupon(redeemed),
      totals: {
        available_cents: totals.available_cents,
        available_display: formatCents(totals.available_cents),
      },
    })
  })

  return app
}
