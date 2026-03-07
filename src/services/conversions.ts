import type { Db } from "../db"
import { notifyCreatorEarnings } from "../lib/push"
import type { Env } from "../types"
import { COUPON_VALUE_CENTS, type CouponResponse, RewardsService } from "./rewards"

export const EARNINGS_PER_CONVERSION = 500

export type ProcessConversionResult =
  | { status: "clip_not_found" }
  | {
      status: "ok"
      clip_id: string
      conversion_recorded: boolean
      earnings_added: number
      bonus_coupon_created: boolean
      bonus_coupon: CouponResponse | null
    }

export class ConversionService {
  constructor(
    private readonly db: Db,
    private readonly rewardsService: RewardsService
  ) {}

  async processConversionForClip(
    clipId: string,
    orderId: string,
    env: Env
  ): Promise<ProcessConversionResult> {
    const clipWithUser = await this.db.getClipWithUser(clipId)
    if (!clipWithUser) {
      return { status: "clip_not_found" }
    }

    const result = await this.db.processConversionAndMaybeBonus({
      order_id: orderId,
      clip_id: clipId,
      user_id: clipWithUser.creator_user_id,
      earnings_cents: EARNINGS_PER_CONVERSION,
      bonus_value_cents: COUPON_VALUE_CENTS,
    })

    if (
      result.conversion_recorded &&
      clipWithUser.push_token &&
      env.APNS_KEY_ID &&
      env.APNS_TEAM_ID &&
      env.APNS_PRIVATE_KEY
    ) {
      await notifyCreatorEarnings(clipWithUser.push_token, EARNINGS_PER_CONVERSION, {
        keyId: env.APNS_KEY_ID,
        teamId: env.APNS_TEAM_ID,
        privateKey: env.APNS_PRIVATE_KEY,
      })
    }

    let bonusCoupon: CouponResponse | null = null
    if (result.bonus_coupon_created && result.bonus_coupon) {
      const synced = await this.rewardsService.syncBonusCoupon(
        result.bonus_coupon,
        clipWithUser.creator_user_id
      )
      bonusCoupon = this.rewardsService.formatCoupon(synced)
    }

    return {
      status: "ok",
      clip_id: clipId,
      conversion_recorded: result.conversion_recorded,
      earnings_added: result.conversion_recorded ? EARNINGS_PER_CONVERSION : 0,
      bonus_coupon_created: result.bonus_coupon_created,
      bonus_coupon: bonusCoupon,
    }
  }
}
