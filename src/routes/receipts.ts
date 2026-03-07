import { Hono } from "hono"
import type { Env } from "../types"
import type { Db } from "../db"

export function receiptsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // GET /receipt/:id - Get receipt details
  app.get("/:id", async (c) => {
    const receiptId = c.req.param("id")
    const receipt = await db.getReceiptById(receiptId)

    if (!receipt) {
      return c.json({ error: "Receipt not found" }, 404)
    }

    return c.json({
      id: receipt.id,
      product_ids: receipt.product_ids,
      used_for_conversions: receipt.used_for_conversions,
      clip_created: receipt.clip_created,
      created_at: receipt.created_at,
    })
  })

  return app
}
