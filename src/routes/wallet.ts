import { Hono } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db } from "../db"
import { generateStorePassJson } from "../lib/wallet"

const redeemWalletSchema = z.object({
  wallet_code: z.string().min(1),
  amount_cents: z.number().int().positive(),
  order_id: z.string().min(1),
})

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
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

    const result = await db.redeemWallet(parsed.data)

    if (result.status === "wallet_not_found") {
      return c.json({ error: "Wallet not found" }, 404)
    }

    if (result.status === "insufficient_balance") {
      return c.json(
        {
          error: "Insufficient balance",
          wallet: {
            wallet_code: result.wallet.wallet_code,
            pass_url: result.wallet.pass_url,
            qr_payload: result.wallet.qr_payload,
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
        wallet_code: result.wallet.wallet_code,
        pass_url: result.wallet.pass_url,
        qr_payload: result.wallet.qr_payload,
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
  })

  app.get("/:walletCode/balance", async (c) => {
    const walletCode = c.req.param("walletCode")
    const wallet = await db.getCreatorWalletByCode(walletCode)

    if (!wallet) {
      return c.json({ error: "Wallet not found" }, 404)
    }

    const balances = await db.getRewardBalances(wallet.user_id)

    return c.json({
      wallet: {
        wallet_code: wallet.wallet_code,
        pass_url: wallet.pass_url,
        qr_payload: wallet.qr_payload,
      },
      balances: {
        available_cents: balances.available_cents,
        available_display: formatCents(balances.available_cents),
        lifetime_earned_cents: balances.lifetime_earned_cents,
        lifetime_earned_display: formatCents(balances.lifetime_earned_cents),
      },
    })
  })

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

    return c.json({
      pass: passJson,
      earnings_cents: result.earnings,
      earnings_dollars: (result.earnings / 100).toFixed(2),
    })
  })

  return app
}
