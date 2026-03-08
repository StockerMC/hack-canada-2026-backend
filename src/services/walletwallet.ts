import type { Env } from "../types"
import { buildAbsoluteHttpsUrl, resolvePublicApiBaseUrl } from "../lib/urls"

export type WalletPassInput = {
  walletCode: string
  qrPayload: string
  balanceCents: number
}

export class WalletWalletService {
  constructor(private readonly env: Env) {}

  isConfigured(): boolean {
    const apiKey = this.env.WALLETWALLET_API_KEY
    return Boolean(apiKey)
  }

  getPassUrl(walletCode: string, requestOrigin?: string): string | null {
    if (!requestOrigin && !this.env.PUBLIC_API_BASE_URL) {
      return null
    }

    const apiBase = resolvePublicApiBaseUrl(this.env.PUBLIC_API_BASE_URL, requestOrigin ?? "https://localhost")
    return buildAbsoluteHttpsUrl(apiBase, `wallet/${walletCode}/pass`)
  }

  async generatePkPass(input: WalletPassInput): Promise<ArrayBuffer | null> {
    const apiKey = this.env.WALLETWALLET_API_KEY
    const endpoint = this.resolvePkPassEndpoint()

    if (!apiKey) {
      return null
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          barcodeValue: input.qrPayload,
          barcodeFormat: "QR",
          title: "CLIPSTAKES Rewards",
          label: "Wallet",
          value: `${input.walletCode} • ${formatCents(input.balanceCents)}`,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        console.error("WalletWallet pkpass generation failed", {
          status: response.status,
          walletCode: input.walletCode,
          responseBody: body.slice(0, 200),
        })
        return null
      }

      return await response.arrayBuffer()
    } catch (error) {
      console.error("WalletWallet request failed", {
        walletCode: input.walletCode,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  private resolvePkPassEndpoint(): string {
    const base = (this.env.WALLETWALLET_BASE_URL ?? "https://api.walletwallet.dev").replace(/\/+$/, "")
    if (base.endsWith("/api")) {
      return `${base}/pkpass`
    }
    return `${base}/api/pkpass`
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
