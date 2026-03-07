import { Hono } from "hono"
import type { Env } from "../types"
import type { Db } from "../db"

export function earningsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // GET /earnings/:userId - Get creator's earnings
  app.get("/:userId", async (c) => {
    const userId = c.req.param("userId")
    const result = await db.getUserEarnings(userId)

    if (!result) {
      return c.json({ error: "User not found" }, 404)
    }

    return c.json({
      user_id: result.id,
      earnings_cents: result.earnings,
      earnings_dollars: (result.earnings / 100).toFixed(2),
    })
  })

  return app
}
