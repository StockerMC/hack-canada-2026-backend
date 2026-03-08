import { Hono, type Context } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { CreatorWallet, Db } from "../db"
import { generatePkpass, generateStorePassJson } from "../lib/wallet"
import { WalletWalletService } from "../services/walletwallet"
import { isWalletLedgerSchemaError } from "../lib/dbErrors"

const redeemWalletSchema = z.object({
  wallet_code: z.string().min(1),
  amount_cents: z.number().int().positive(),
  order_id: z.string().min(1),
})

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
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

async function ensureWalletPassUrl(
  db: Db,
  walletWalletService: WalletWalletService,
  wallet: CreatorWallet,
  requestOrigin: string
): Promise<CreatorWallet> {
  const passUrl = walletWalletService.getPassUrl(wallet.wallet_code, requestOrigin)
  if (!passUrl || passUrl === wallet.pass_url) {
    return wallet
  }

  const updated = await db.updateCreatorWalletPassUrl(wallet.id, passUrl)
  return updated ?? { ...wallet, pass_url: passUrl }
}

export function walletRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  app.post("/redeem", async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid request body" }, 400)
    }

    const parsed = redeemWalletSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
    }

    const requestOrigin = new URL(c.req.url).origin
    const walletWalletService = new WalletWalletService(c.env)

    try {
      const result = await db.redeemWallet(parsed.data)

      if (result.status === "wallet_not_found") {
        return c.json({ error: "Wallet not found" }, 404)
      }

      const wallet = await ensureWalletPassUrl(db, walletWalletService, result.wallet, requestOrigin)

      if (result.status === "insufficient_balance") {
        return c.json(
          {
            error: "Insufficient balance",
            wallet: {
              wallet_code: wallet.wallet_code,
              pass_url: wallet.pass_url,
              qr_payload: wallet.qr_payload,
            },
            balances: {
              available_cents: result.available_cents,
              available_display: formatCents(result.available_cents),
            },
          },
          409
        )
      }

      return c.json({
        success: true,
        idempotent: result.status === "already_processed",
        wallet: {
          wallet_code: wallet.wallet_code,
          pass_url: wallet.pass_url,
          qr_payload: wallet.qr_payload,
        },
        redemption: {
          order_id: parsed.data.order_id,
          amount_cents: parsed.data.amount_cents,
          amount_display: formatCents(parsed.data.amount_cents),
        },
        balances: {
          available_cents: result.balances.available_cents,
          available_display: formatCents(result.balances.available_cents),
          lifetime_earned_cents: result.balances.lifetime_earned_cents,
          lifetime_earned_display: formatCents(result.balances.lifetime_earned_cents),
        },
      })
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to redeem wallet balance", error)
      return c.json({ error: "Failed to redeem wallet balance" }, 500)
    }
  })

  app.get("/:walletCode/balance", async (c) => {
    const requestOrigin = new URL(c.req.url).origin
    const walletWalletService = new WalletWalletService(c.env)

    try {
      const walletCode = c.req.param("walletCode")
      const wallet = await db.getCreatorWalletByCode(walletCode)

      if (!wallet) {
        return c.json({ error: "Wallet not found" }, 404)
      }

      const syncedWallet = await ensureWalletPassUrl(db, walletWalletService, wallet, requestOrigin)
      const balances = await db.getRewardBalances(wallet.user_id)

      return c.json({
        wallet: {
          wallet_code: syncedWallet.wallet_code,
          pass_url: syncedWallet.pass_url,
          qr_payload: syncedWallet.qr_payload,
        },
        balances: {
          available_cents: balances.available_cents,
          available_display: formatCents(balances.available_cents),
          lifetime_earned_cents: balances.lifetime_earned_cents,
          lifetime_earned_display: formatCents(balances.lifetime_earned_cents),
        },
      })
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to fetch wallet balance", error)
      return c.json({ error: "Failed to fetch wallet balance" }, 500)
    }
  })

  app.get("/:walletCode/pass", async (c) => {
    const requestOrigin = new URL(c.req.url).origin
    const walletWalletService = new WalletWalletService(c.env)

    try {
      const walletCode = c.req.param("walletCode")
      const wallet = await db.getCreatorWalletByCode(walletCode)

      if (!wallet) {
        return c.json({ error: "Wallet not found" }, 404)
      }

      const syncedWallet = await ensureWalletPassUrl(db, walletWalletService, wallet, requestOrigin)
      const balances = await db.getRewardBalances(wallet.user_id)

      let pkpass = await walletWalletService.generatePkPass({
        walletCode: syncedWallet.wallet_code,
        qrPayload: syncedWallet.qr_payload,
        balanceCents: balances.available_cents,
      })

      if (!pkpass) {
        pkpass = await generatePkpass(wallet.user_id, balances.available_cents, {
          passTypeId: c.env.WALLET_PASS_TYPE_ID ?? "pass.com.clipstakes.rewards",
          teamId: c.env.WALLET_TEAM_ID ?? "CLIPSTAKES",
          cert: c.env.WALLET_CERT ?? "",
          certPassword: c.env.WALLET_CERT_PASSWORD ?? "",
        })
      }

      return new Response(pkpass, {
        headers: {
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": `attachment; filename=\"${syncedWallet.wallet_code}.pkpass\"`,
          "Cache-Control": "no-store",
        },
      })
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to generate wallet pass", error)
      return c.json({ error: "Failed to generate wallet pass" }, 502)
    }
  })

  app.get("/:userId", async (c) => {
    try {
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

      return c.json({
        pass: passJson,
        earnings_cents: result.earnings,
        earnings_dollars: (result.earnings / 100).toFixed(2),
      })
    } catch (error) {
      if (isWalletLedgerSchemaError(error)) {
        return walletLedgerUnavailable(c)
      }

      console.error("Failed to fetch legacy wallet payload", error)
      return c.json({ error: "Failed to fetch wallet payload" }, 500)
    }
  })

  return app
}
