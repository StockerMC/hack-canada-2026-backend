import type { Env } from "../types"

type WalletWalletResponse = {
  pass_url?: string
  wallet_pass_url?: string
  url?: string
}

export type CreateOrUpdateWalletPassInput = {
  walletCode: string
  qrPayload: string
  userId: string
  balanceCents: number
  existingPassUrl?: string | null
}

export class WalletWalletService {
  constructor(private readonly env: Env) {}

  async createOrUpdatePassForWallet(input: CreateOrUpdateWalletPassInput): Promise<string | null> {
    const apiKey = this.env.WALLETWALLET_API_KEY
    const templateId = this.env.WALLETWALLET_TEMPLATE_ID
    const baseUrl = this.env.WALLETWALLET_BASE_URL ?? "https://api.walletwallet.dev"

    if (!apiKey || !templateId) {
      return null
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/passes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: templateId,
          external_id: input.walletCode,
          barcode_value: input.qrPayload,
          fields: {
            wallet_code: input.walletCode,
            user_id: input.userId,
            balance_cents: input.balanceCents,
          },
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        console.error("WalletWallet pass sync failed", {
          status: response.status,
          walletCode: input.walletCode,
          responseBody: body.slice(0, 200),
        })
        return null
      }

      const payload = (await response.json()) as WalletWalletResponse
      return payload.pass_url ?? payload.wallet_pass_url ?? payload.url ?? input.existingPassUrl ?? null
    } catch (error) {
      console.error("WalletWallet request failed", {
        walletCode: input.walletCode,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
