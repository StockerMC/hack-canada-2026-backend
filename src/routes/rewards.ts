import { Hono } from "hono"
import type { Env } from "../types"
import type { Db } from "../db"
import { RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"

export function rewardsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  app.get("/me", async (c) => {
    const deviceId = c.req.header("X-Device-ID")
    if (!deviceId) {
      return c.json({ error: "X-Device-ID header required" }, 401)
    }

    let user = await db.getUserByDeviceId(deviceId)
    if (!user) {
      user = await db.createUser(deviceId, null)
    }

    const rewardsService = new RewardsService(db, new WalletWalletService(c.env))
    const summary = await rewardsService.getWalletSummary(user.id, 25)

    return c.json({
      ...summary,
      totals: {
        available_cents: summary.balances.available_cents,
        available_display: summary.balances.available_display,
      },
      coupons: [],
    })
  })

  return app
}
