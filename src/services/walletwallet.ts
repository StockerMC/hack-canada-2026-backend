import type { Coupon } from "../db"
import type { Env } from "../types"

type WalletWalletResponse = {
  pass_url?: string
  wallet_pass_url?: string
  url?: string
}

type CreateWalletPassInput = {
  coupon: Coupon
  userId: string
}

export class WalletWalletService {
  constructor(private readonly env: Env) {}

  async createPassForCoupon(input: CreateWalletPassInput): Promise<string | null> {
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
          external_id: input.coupon.code,
          barcode_value: input.coupon.code,
          fields: {
            coupon_code: input.coupon.code,
            coupon_type: input.coupon.type,
            value_cents: input.coupon.value_cents,
            user_id: input.userId,
            clip_id: input.coupon.clip_id,
          },
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        console.error("WalletWallet pass creation failed", {
          status: response.status,
          couponCode: input.coupon.code,
          couponType: input.coupon.type,
          responseBody: body.slice(0, 200),
        })
        return null
      }

      const payload = (await response.json()) as WalletWalletResponse
      return payload.pass_url ?? payload.wallet_pass_url ?? payload.url ?? null
    } catch (error) {
      console.error("WalletWallet request failed", {
        couponCode: input.coupon.code,
        couponType: input.coupon.type,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
