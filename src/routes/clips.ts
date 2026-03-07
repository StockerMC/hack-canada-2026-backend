import { Hono } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db } from "../db"
import { REWARD_CENTS, RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"

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

    let user = await db.getUserByDeviceId(deviceId)
    if (!user) {
      user = await db.createUser(deviceId, null)
    }

    const rewardsService = new RewardsService(db, new WalletWalletService(c.env))

    if (parsed.data.receipt_id) {
      const result = await db.createClipWithReceiptAndReward({
        user_id: user.id,
        receipt_id: parsed.data.receipt_id,
        product_id: parsed.data.product_id,
        video_url: parsed.data.video_url,
        text_overlay: parsed.data.text_overlay ?? null,
        text_position: parsed.data.text_position ?? null,
        duration_seconds: parsed.data.duration_seconds ?? null,
        reward_cents: REWARD_CENTS,
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

      const { wallet, balances } = await rewardsService.getWalletAndBalances(user.id)

      return c.json(
        {
          clip: result.clip,
          reward: rewardsService.formatReward(REWARD_CENTS, "clip_published"),
          wallet,
          balances,
          totals: {
            available_cents: balances.available_cents,
            available_display: balances.available_display,
          },
          instant_coupon: null,
        },
        201
      )
    }

    const created = await db.createClipAndReward({
      user_id: user.id,
      product_id: parsed.data.product_id,
      video_url: parsed.data.video_url,
      text_overlay: parsed.data.text_overlay ?? null,
      text_position: parsed.data.text_position ?? null,
      duration_seconds: parsed.data.duration_seconds ?? null,
      reward_cents: REWARD_CENTS,
    })

    const { wallet, balances } = await rewardsService.getWalletAndBalances(user.id)

    return c.json(
      {
        clip: created.clip,
        reward: rewardsService.formatReward(REWARD_CENTS, "clip_published"),
        wallet,
        balances,
        totals: {
          available_cents: balances.available_cents,
          available_display: balances.available_display,
        },
        instant_coupon: null,
      },
      201
    )
  })

  return app
}
