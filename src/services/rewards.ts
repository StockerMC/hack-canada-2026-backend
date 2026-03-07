import type {
  Clip,
  Coupon,
  CouponType,
  CreateClipWithReceiptInput,
  CreateClipWithReceiptResult,
  Db,
} from "../db"
import { WalletWalletService } from "./walletwallet"

export const COUPON_VALUE_CENTS = 500

export type CouponResponse = {
  code: string
  value_cents: number
  value_display: string
  type: CouponType
  source_clip_id: string | null
  created_at: Date
  expires_at: Date | null
  redeemed: boolean
  wallet_pass_url: string | null
}

export type RewardTotalsResponse = {
  available_cents: number
  available_display: string
}

export type CreateClipRewardResult =
  | { status: "receipt_not_found" | "receipt_already_used" | "product_not_in_receipt" }
  | {
      status: "created"
      clip: Clip
      instantCoupon: Coupon
      totals: RewardTotalsResponse
    }

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function mapCoupon(coupon: Coupon): CouponResponse {
  return {
    code: coupon.code,
    value_cents: coupon.value_cents,
    value_display: formatCents(coupon.value_cents),
    type: coupon.type,
    source_clip_id: coupon.clip_id,
    created_at: coupon.created_at,
    expires_at: coupon.expires_at,
    redeemed: coupon.redeemed,
    wallet_pass_url: coupon.wallet_pass_url,
  }
}

export class RewardsService {
  constructor(
    private readonly db: Db,
    private readonly walletWalletService: WalletWalletService
  ) {}

  private async syncWalletPass(coupon: Coupon, userId: string): Promise<Coupon> {
    if (coupon.wallet_pass_url) {
      return coupon
    }

    const walletPassUrl = await this.walletWalletService.createPassForCoupon({
      coupon,
      userId,
    })

    if (!walletPassUrl) {
      return coupon
    }

    const updated = await this.db.updateCouponWalletPassUrl(coupon.id, walletPassUrl)
    return updated ?? { ...coupon, wallet_pass_url: walletPassUrl }
  }

  async createClipAndInstantCoupon(input: CreateClipWithReceiptInput): Promise<CreateClipRewardResult> {
    const result: CreateClipWithReceiptResult = await this.db.createClipWithReceiptAndInstantCoupon(input)
    if (result.status !== "created") {
      return result
    }

    const syncedCoupon = await this.syncWalletPass(result.coupon, input.user_id)
    const totals = await this.getTotals(input.user_id)

    return {
      status: "created",
      clip: result.clip,
      instantCoupon: syncedCoupon,
      totals,
    }
  }

  async syncBonusCoupon(coupon: Coupon, userId: string): Promise<Coupon> {
    return this.syncWalletPass(coupon, userId)
  }

  async getTotals(userId: string): Promise<RewardTotalsResponse> {
    const totals = await this.db.getAvailableCouponTotals(userId)
    return {
      available_cents: totals.available_cents,
      available_display: formatCents(totals.available_cents),
    }
  }

  async getRewards(userId: string): Promise<{ coupons: CouponResponse[]; totals: RewardTotalsResponse }> {
    const [coupons, totals] = await Promise.all([
      this.db.getCouponsByUserId(userId),
      this.getTotals(userId),
    ])

    return {
      coupons: coupons.map(mapCoupon),
      totals,
    }
  }

  async redeemCoupon(
    userId: string,
    code: string
  ): Promise<
    | { status: "not_found" }
    | { status: "already_redeemed" }
    | { status: "expired" }
    | { status: "redeemed"; coupon: CouponResponse; totals: RewardTotalsResponse }
  > {
    const existing = await this.db.getCouponByCode(userId, code)
    if (!existing) {
      return { status: "not_found" }
    }
    if (existing.redeemed) {
      return { status: "already_redeemed" }
    }
    if (existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now()) {
      return { status: "expired" }
    }

    const redeemed = await this.db.redeemCouponByCode(userId, code)
    if (!redeemed) {
      return { status: "already_redeemed" }
    }

    const totals = await this.getTotals(userId)
    return {
      status: "redeemed",
      coupon: mapCoupon(redeemed),
      totals,
    }
  }

  formatCoupon(coupon: Coupon): CouponResponse {
    return mapCoupon(coupon)
  }
}
