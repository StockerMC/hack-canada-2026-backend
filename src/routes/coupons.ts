import { Hono } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db } from "../db"
import { RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"

const redeemCouponSchema = z.object({
  code: z.string().min(1),
})

export function couponsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // POST /coupons/redeem - Redeem a coupon code for the current device
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

    const rewardsService = new RewardsService(db, new WalletWalletService(c.env))
    const result = await rewardsService.redeemCoupon(user.id, parsed.data.code)

    if (result.status === "not_found") {
      return c.json({ error: "Coupon not found" }, 404)
    }
    if (result.status === "already_redeemed") {
      return c.json({ error: "Coupon already redeemed" }, 409)
    }
    if (result.status === "expired") {
      return c.json({ error: "Coupon expired" }, 409)
    }

    return c.json({
      coupon: result.coupon,
      totals: result.totals,
    })
  })

  return app
}
