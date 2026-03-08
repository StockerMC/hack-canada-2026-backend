import { Hono, type Context } from "hono"
import type { Env } from "../types"
import type { Db, User } from "../db"
import { RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"
import { isUniqueViolation, isWalletLedgerSchemaError } from "../lib/dbErrors"

export function rewardsRoutes(db: Db) {
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

  app.get("/me", async (c) => {
    const requestOrigin = new URL(c.req.url).origin
    const deviceId = c.req.header("X-Device-ID")
    if (!deviceId) {
      return c.json({ error: "X-Device-ID header required" }, 401)
    }

    try {
      const user = await getOrCreateUser(deviceId)
      const rewardsService = new RewardsService(db, new WalletWalletService(c.env))
      const summary = await rewardsService.getWalletSummary(user.id, 25, requestOrigin)

      return c.json({
        ...summary,
        totals: {
          available_cents: summary.balances.available_cents,
          available_display: summary.balances.available_display,
        },
        coupons: [],
      })
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to load rewards summary", error)
      return c.json({ error: "Failed to load rewards summary" }, 500)
    }
  })

  return app
}
