import { Hono } from "hono"
import type { Env } from "../types"
import type { Db } from "../db"
import { generateStorePassJson } from "../lib/wallet"

export function walletRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // GET /wallet/:userId - Generate Apple Wallet pass data
  app.get("/:userId", async (c) => {
    const userId = c.req.param("userId")
    const result = await db.getUserEarnings(userId)

    if (!result) {
      return c.json({ error: "User not found" }, 404)
    }

    if (!c.env.WALLET_PASS_TYPE_ID || !c.env.WALLET_TEAM_ID) {
      return c.json({ error: "Wallet pass signing not configured" }, 503)
    }

    const passJson = generateStorePassJson(userId, result.earnings, {
      passTypeId: c.env.WALLET_PASS_TYPE_ID,
      teamId: c.env.WALLET_TEAM_ID,
      cert: c.env.WALLET_CERT ?? "",
      certPassword: c.env.WALLET_CERT_PASSWORD ?? "",
    })

    // Return pass data as JSON
    // In production, this would return a signed .pkpass file
    // with Content-Type: application/vnd.apple.pkpass
    return c.json({
      pass: passJson,
      earnings_cents: result.earnings,
      earnings_dollars: (result.earnings / 100).toFixed(2),
    })
  })

  return app
}
