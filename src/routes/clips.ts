import { Hono } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db } from "../db"
import { WalletWalletService } from "../services/walletwallet"
import { COUPON_VALUE_CENTS, RewardsService } from "../services/rewards"

const createClipSchema = z.object({
  receipt_id: z.string().min(1).optional(),
  product_id: z.string().min(1),
  video_url: z.string().url(),
  text_overlay: z.string().max(140).optional(),
  text_position: z.string().max(40).optional(),
  duration_seconds: z.number().int().positive().max(300).optional(),
})

export function clipsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // GET /clips/:productId - Get clips for a product (ranked by conversions)
  app.get("/:productId", async (c) => {
    const productId = c.req.param("productId")
    const clips = await db.getClipsByProductId(productId)

    return c.json({
      clips: clips.map((clip) => ({
        id: clip.id,
        video_url: clip.video_url,
        conversions: clip.conversions,
        created_at: clip.created_at,
      })),
    })
  })

  // POST /clips - Create a new clip
  app.post("/", async (c) => {
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

    const parsed = createClipSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
    }

    // Get or create user
    let user = await db.getUserByDeviceId(deviceId)
    if (!user) {
      user = await db.createUser(deviceId, null)
    }

    const rewardsService = new RewardsService(db, new WalletWalletService(c.env))

    if (parsed.data.receipt_id) {
      const result = await rewardsService.createClipAndInstantCoupon({
        user_id: user.id,
        receipt_id: parsed.data.receipt_id,
        product_id: parsed.data.product_id,
        video_url: parsed.data.video_url,
        text_overlay: parsed.data.text_overlay ?? null,
        text_position: parsed.data.text_position ?? null,
        duration_seconds: parsed.data.duration_seconds ?? null,
        instant_value_cents: COUPON_VALUE_CENTS,
      })

      if (result.status === "receipt_not_found") {
        return c.json({ error: "Receipt not found" }, 404)
      }
      if (result.status === "receipt_already_used") {
        return c.json({ error: "Receipt already used for clip creation" }, 409)
      }
      if (result.status === "product_not_in_receipt") {
        return c.json({ error: "product_id is not present on receipt" }, 400)
      }

      if (result.status !== "created") {
        return c.json({ error: "Failed to create clip" }, 500)
      }

      const instantCoupon = rewardsService.formatCoupon(result.instantCoupon)

      return c.json(
        {
          clip: result.clip,
          instant_coupon: {
            code: instantCoupon.code,
            value_cents: instantCoupon.value_cents,
            value_display: instantCoupon.value_display,
            type: instantCoupon.type,
            expires_at: instantCoupon.expires_at,
            redeemed: instantCoupon.redeemed,
            wallet_pass_url: instantCoupon.wallet_pass_url,
          },
          totals: result.totals,
        },
        201
      )
    }

    // Legacy path kept for backwards compatibility with older clients.
    const clip = await db.createClip(user.id, parsed.data.product_id, parsed.data.video_url, {
      text_overlay: parsed.data.text_overlay ?? null,
      text_position: parsed.data.text_position ?? null,
      duration_seconds: parsed.data.duration_seconds ?? null,
    })

    return c.json({ clip }, 201)
  })

  return app
}
