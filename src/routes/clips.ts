import { Hono, type Context } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db, User } from "../db"
import { REWARD_CENTS, RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"
import { isUniqueViolation, isWalletLedgerSchemaError } from "../lib/dbErrors"

const createClipSchema = z.object({
  receipt_id: z.string().min(1).optional(),
  product_id: z.string().min(1),
  video_url: z.string().url(),
  text_overlay: z.string().max(140).optional(),
  text_position: z.string().max(40).optional(),
  duration_seconds: z.number().int().positive().max(300).optional(),
})

function mapClipForViewer(clip: {
  id: string
  product_id: string
  video_url: string
  text_overlay: string | null
  text_position: string | null
  duration_seconds: number | null
  conversions: number
  created_at: Date
}) {
  return {
    id: clip.id,
    clip_id: clip.id,
    product_id: clip.product_id,
    video_url: clip.video_url,
    url: clip.video_url,
    text_overlay: clip.text_overlay,
    text_position: clip.text_position,
    duration_seconds: clip.duration_seconds,
    conversions: clip.conversions,
    is_active: true,
    created_at: clip.created_at,
  }
}

export function clipsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  async function getOrCreateUser(deviceId: string): Promise<User> {
    const existing = await db.getUserByDeviceId(deviceId)
    if (existing) {
      return existing
    }

    try {
      return await db.createUser(deviceId, null)
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }

      const raced = await db.getUserByDeviceId(deviceId)
      if (raced) {
        return raced
      }
      throw error
    }
  }

  function walletLedgerUnavailable(c: Context<{ Bindings: Env }>) {
    return c.json(
      {
        error: "Wallet/rewards database schema is not initialized",
        required_migrations: [
          "sql/migrations/20260307_coupon_wallet.sql",
          "sql/migrations/20260307_wallet_ledger.sql",
        ],
      },
      503
    )
  }

  app.get("/:productId", async (c) => {
    const productId = c.req.param("productId")
    const clips = await db.getClipsByProductId(productId)

    return c.json({
      clips: clips.map((clip) => mapClipForViewer(clip)),
    })
  })

  app.post("/", async (c) => {
    const requestOrigin = new URL(c.req.url).origin
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

    try {
      const user = await getOrCreateUser(deviceId)
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

        const { wallet, balances } = await rewardsService.getWalletAndBalances(user.id, requestOrigin)

        return c.json(
          {
            clip: result.clip,
            id: result.clip.id,
            clip_id: result.clip.id,
            reward: rewardsService.formatReward(REWARD_CENTS, "clip_published"),
            wallet,
            wallet_code: wallet.wallet_code,
            pass_url: wallet.pass_url,
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

      const { wallet, balances } = await rewardsService.getWalletAndBalances(user.id, requestOrigin)

      return c.json(
        {
          clip: created.clip,
          id: created.clip.id,
          clip_id: created.clip.id,
          reward: rewardsService.formatReward(REWARD_CENTS, "clip_published"),
          wallet,
          wallet_code: wallet.wallet_code,
          pass_url: wallet.pass_url,
          balances,
          totals: {
            available_cents: balances.available_cents,
            available_display: balances.available_display,
          },
          instant_coupon: null,
        },
        201
      )
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to create clip", error)
      return c.json({ error: "Failed to create clip" }, 500)
    }
  })

  return app
}
