import { Hono, type Context } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db, User } from "../db"
import { ConversionService } from "../services/conversions"
import { RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"
import { isUniqueViolation, isWalletLedgerSchemaError } from "../lib/dbErrors"

const checkoutDevSchema = z.object({
  product_id: z.string().min(1),
  clip_id: z.string().min(1).optional(),
})

export function checkoutRoutes(db: Db) {
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

  app.post("/dev", async (c) => {
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

    const parsed = checkoutDevSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
    }

    try {
      await getOrCreateUser(deviceId)
      const receipt = await db.createReceipt([parsed.data.product_id])
      const orderId = `order_${receipt.id}`

      if (!parsed.data.clip_id) {
        return c.json(
          {
            order_id: orderId,
            receipt_id: receipt.id,
            conversion: null,
          },
          201
        )
      }

      const rewardsService = new RewardsService(db, new WalletWalletService(c.env))
      const conversionService = new ConversionService(db, rewardsService)
      const result = await conversionService.processConversionForClip(
        parsed.data.clip_id,
        orderId,
        c.env,
        requestOrigin
      )

      if (result.status === "clip_not_found") {
        const zeroReward = rewardsService.formatReward(0, "conversion")
        return c.json(
          {
            order_id: orderId,
            receipt_id: receipt.id,
            conversion: {
              success: false,
              credited_cents: zeroReward.credited_cents,
              credited_display: zeroReward.credited_display,
              available_balance_cents: 0,
              available_balance_display: zeroReward.credited_display,
              push_sent: false,
              within_push_window: false,
            },
          },
          201
        )
      }

      const reward = rewardsService.formatReward(result.credited_cents, "conversion")

      return c.json(
        {
          order_id: orderId,
          receipt_id: receipt.id,
          conversion: {
            success: true,
            credited_cents: reward.credited_cents,
            credited_display: reward.credited_display,
            available_balance_cents: result.balances.available_cents,
            available_balance_display: result.balances.available_display,
            push_sent: result.push_sent,
            within_push_window: result.within_window,
          },
        },
        201
      )
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to create dev checkout", error)
      return c.json({ error: "Failed to create checkout" }, 500)
    }
  })

  return app
}
