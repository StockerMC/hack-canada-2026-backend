import { Hono } from "hono"
import type { Env } from "../types"
import type { Db } from "../db"
import { RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"

export function rewardsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // GET /rewards/me - Get coupons and available totals for current device
  app.get("/me", async (c) => {
    const deviceId = c.req.header("X-Device-ID")
    if (!deviceId) {
      return c.json({ error: "X-Device-ID header required" }, 401)
    }

    const user = await db.getUserByDeviceId(deviceId)
    if (!user) {
      return c.json({
        coupons: [],
        totals: {
          available_cents: 0,
          available_display: "$0.00",
        },
      })
    }

    const rewardsService = new RewardsService(db, new WalletWalletService(c.env))
    const rewards = await rewardsService.getRewards(user.id)
    return c.json(rewards)
  })

  return app
}
