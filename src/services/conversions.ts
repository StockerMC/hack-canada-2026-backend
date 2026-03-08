import type { Db } from "../db"
import { notifyCreatorEarnings } from "../lib/push"
import type { Env } from "../types"
import { REWARD_CENTS, RewardsService } from "./rewards"

export type ProcessConversionResult =
  | { status: "clip_not_found" }
  | {
      status: "ok"
      clip_id: string
      conversion_recorded: boolean
      reward_credited: boolean
      credited_cents: number
      balances: {
        available_cents: number
        available_display: string
        lifetime_earned_cents: number
        lifetime_earned_display: string
      }
      within_window: boolean
      push_sent: boolean
    }

export class ConversionService {
  constructor(
    private readonly db: Db,
    private readonly rewardsService: RewardsService
  ) {}

  async processConversionForClip(
    clipId: string,
    orderId: string,
    env: Env,
    requestOrigin?: string
  ): Promise<ProcessConversionResult> {
    const result = await this.db.processConversionReward({
      clip_id: clipId,
      order_id: orderId,
      reward_cents: REWARD_CENTS,
    })

    if (result.status === "clip_not_found") {
      return { status: "clip_not_found" }
    }

    let pushSent = false
    if (
      result.conversion_recorded &&
      result.within_window &&
      result.push_token &&
      env.APNS_KEY_ID &&
      env.APNS_TEAM_ID &&
      env.APNS_PRIVATE_KEY
    ) {
      const pushResult = await notifyCreatorEarnings(result.push_token, REWARD_CENTS, {
        keyId: env.APNS_KEY_ID,
        teamId: env.APNS_TEAM_ID,
        privateKey: env.APNS_PRIVATE_KEY,
      })
      pushSent = pushResult.success
    }

    const wallet = await this.rewardsService.ensureWallet(result.creator_user_id)
    await this.rewardsService.syncWalletPassWithOrigin(result.creator_user_id, wallet, requestOrigin)

    const balances = await this.rewardsService.getBalances(result.creator_user_id)

    return {
      status: "ok",
      clip_id: result.clip_id,
      conversion_recorded: result.conversion_recorded,
      reward_credited: result.reward_credited,
      credited_cents: result.reward_credited ? REWARD_CENTS : 0,
      balances,
      within_window: result.within_window,
      push_sent: pushSent,
    }
  }
}
