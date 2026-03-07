import type {
  Clip,
  ClipWithCreator,
  ClipWithUser,
  Coupon,
  CreateClipAndRewardInput,
  CreateClipAndRewardResult,
  CreateClipWithReceiptInput,
  CreateClipWithReceiptResult,
  CreatorWallet,
  Db,
  ProcessConversionInput,
  ProcessConversionResult,
  Receipt,
  RedeemWalletInput,
  RedeemWalletResult,
  RewardBalances,
  RewardTransaction,
  User,
} from "../../src/db"

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000

function formatWalletCode(userId: string): string {
  return `CLIP-${userId.replace(/-/g, "").toUpperCase()}`
}

export function createInMemoryDb(): Db {
  const users = new Map<string, User>()
  const usersByDeviceId = new Map<string, string>()
  const clips = new Map<string, Clip>()
  const receipts = new Map<string, Receipt>()

  const wallets = new Map<string, CreatorWallet>()
  const walletByUserId = new Map<string, string>()
  const walletByCode = new Map<string, string>()

  const rewardTransactions = new Map<string, RewardTransaction>()
  const rewardTxByIdempotency = new Map<string, string>()

  const conversionsById = new Map<string, { id: string; order_id: string; clip_id: string; user_id: string; created_at: Date }>()
  const conversionIdByOrder = new Map<string, string>()

  const coupons = new Map<string, Coupon>()

  const now = () => new Date()

  const getRewardBalances = (userId: string): RewardBalances => {
    const txs = Array.from(rewardTransactions.values()).filter((tx) => tx.user_id === userId)
    const available_cents = txs.reduce((sum, tx) => sum + tx.amount_cents, 0)
    const lifetime_earned_cents = txs
      .filter((tx) => tx.amount_cents > 0)
      .reduce((sum, tx) => sum + tx.amount_cents, 0)

    return {
      available_cents,
      lifetime_earned_cents,
    }
  }

  const createRewardTransaction = (input: {
    user_id: string
    clip_id: string | null
    conversion_id: string | null
    order_id: string | null
    type: RewardTransaction["type"]
    amount_cents: number
    idempotency_key: string
  }): RewardTransaction | null => {
    if (rewardTxByIdempotency.has(input.idempotency_key)) {
      const existingId = rewardTxByIdempotency.get(input.idempotency_key)
      return existingId ? (rewardTransactions.get(existingId) ?? null) : null
    }

    const tx: RewardTransaction = {
      id: crypto.randomUUID(),
      user_id: input.user_id,
      clip_id: input.clip_id,
      conversion_id: input.conversion_id,
      order_id: input.order_id,
      type: input.type,
      amount_cents: input.amount_cents,
      idempotency_key: input.idempotency_key,
      created_at: now(),
    }

    rewardTransactions.set(tx.id, tx)
    rewardTxByIdempotency.set(tx.idempotency_key, tx.id)
    return tx
  }

  return {
    async getUserByDeviceId(deviceId: string): Promise<User | null> {
      const userId = usersByDeviceId.get(deviceId)
      return userId ? (users.get(userId) ?? null) : null
    },

    async createUser(deviceId: string, pushToken: string | null): Promise<User> {
      const user: User = {
        id: crypto.randomUUID(),
        device_id: deviceId,
        push_token: pushToken,
        earnings: 0,
        created_at: now(),
      }
      users.set(user.id, user)
      usersByDeviceId.set(deviceId, user.id)
      return user
    },

    async updateUserPushToken(userId: string, pushToken: string): Promise<void> {
      const user = users.get(userId)
      if (user) {
        user.push_token = pushToken
      }
    },

    async updateUserEarnings(userId: string, amount: number): Promise<void> {
      const user = users.get(userId)
      if (user) {
        user.earnings += amount
      }
    },

    async getUserEarnings(userId: string): Promise<{ id: string; earnings: number } | null> {
      const user = users.get(userId)
      return user ? { id: user.id, earnings: user.earnings } : null
    },

    async getClipsByProductId(productId: string): Promise<ClipWithCreator[]> {
      return Array.from(clips.values())
        .filter((clip) => clip.product_id === productId)
        .sort((a, b) => b.conversions - a.conversions)
        .map((clip) => ({
          ...clip,
          creator_device_id: users.get(clip.user_id)?.device_id ?? "unknown",
        }))
    },

    async getClipById(clipId: string): Promise<Clip | null> {
      return clips.get(clipId) ?? null
    },

    async createClip(
      userId: string,
      productId: string,
      videoUrl: string,
      options?: {
        text_overlay?: string | null
        text_position?: string | null
        duration_seconds?: number | null
      }
    ): Promise<Clip> {
      const clip: Clip = {
        id: crypto.randomUUID(),
        user_id: userId,
        receipt_id: null,
        product_id: productId,
        video_url: videoUrl,
        text_overlay: options?.text_overlay ?? null,
        text_position: options?.text_position ?? null,
        duration_seconds: options?.duration_seconds ?? null,
        conversions: 0,
        created_at: now(),
      }
      clips.set(clip.id, clip)
      return clip
    },

    async createClipWithReceiptAndReward(
      input: CreateClipWithReceiptInput
    ): Promise<CreateClipWithReceiptResult> {
      const receipt = receipts.get(input.receipt_id)
      if (!receipt) {
        return { status: "receipt_not_found" }
      }
      if (receipt.clip_created) {
        return { status: "receipt_already_used" }
      }
      if (!receipt.product_ids.includes(input.product_id)) {
        return { status: "product_not_in_receipt" }
      }

      const clip: Clip = {
        id: crypto.randomUUID(),
        user_id: input.user_id,
        receipt_id: input.receipt_id,
        product_id: input.product_id,
        video_url: input.video_url,
        text_overlay: input.text_overlay ?? null,
        text_position: input.text_position ?? null,
        duration_seconds: input.duration_seconds ?? null,
        conversions: 0,
        created_at: now(),
      }
      clips.set(clip.id, clip)

      receipt.clip_created = true
      receipt.clip_id = clip.id
      receipt.used_for_conversions = true
      receipts.set(receipt.id, receipt)

      const rewardTransaction = createRewardTransaction({
        user_id: input.user_id,
        clip_id: clip.id,
        conversion_id: null,
        order_id: null,
        type: "clip_published",
        amount_cents: input.reward_cents,
        idempotency_key: `clip_published:${clip.id}`,
      })

      if (!rewardTransaction) {
        throw new Error("Failed to create reward transaction")
      }

      const user = users.get(input.user_id)
      if (user) {
        user.earnings += input.reward_cents
      }

      return {
        status: "created",
        clip,
        reward_transaction: rewardTransaction,
      }
    },

    async createClipAndReward(input: CreateClipAndRewardInput): Promise<CreateClipAndRewardResult> {
      const clip: Clip = {
        id: crypto.randomUUID(),
        user_id: input.user_id,
        receipt_id: null,
        product_id: input.product_id,
        video_url: input.video_url,
        text_overlay: input.text_overlay ?? null,
        text_position: input.text_position ?? null,
        duration_seconds: input.duration_seconds ?? null,
        conversions: 0,
        created_at: now(),
      }
      clips.set(clip.id, clip)

      const rewardTransaction = createRewardTransaction({
        user_id: input.user_id,
        clip_id: clip.id,
        conversion_id: null,
        order_id: null,
        type: "clip_published",
        amount_cents: input.reward_cents,
        idempotency_key: `clip_published:${clip.id}`,
      })

      if (!rewardTransaction) {
        throw new Error("Failed to create reward transaction")
      }

      const user = users.get(input.user_id)
      if (user) {
        user.earnings += input.reward_cents
      }

      return {
        clip,
        reward_transaction: rewardTransaction,
      }
    },

    async incrementClipConversions(clipId: string): Promise<void> {
      const clip = clips.get(clipId)
      if (clip) {
        clip.conversions += 1
      }
    },

    async getClipWithUser(clipId: string): Promise<ClipWithUser | null> {
      const clip = clips.get(clipId)
      if (!clip) return null
      const user = users.get(clip.user_id)
      return {
        ...clip,
        push_token: user?.push_token ?? null,
        creator_user_id: clip.user_id,
      }
    },

    async getReceiptById(receiptId: string): Promise<Receipt | null> {
      return receipts.get(receiptId) ?? null
    },

    async createReceipt(productIds: string[]): Promise<Receipt> {
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        product_ids: productIds,
        used_for_conversions: false,
        clip_created: false,
        clip_id: null,
        created_at: now(),
      }
      receipts.set(receipt.id, receipt)
      return receipt
    },

    async markReceiptUsed(receiptId: string): Promise<void> {
      const receipt = receipts.get(receiptId)
      if (receipt) {
        receipt.used_for_conversions = true
      }
    },

    async processConversionReward(input: ProcessConversionInput): Promise<ProcessConversionResult> {
      const clip = clips.get(input.clip_id)
      if (!clip) {
        return { status: "clip_not_found" }
      }

      const creator = users.get(clip.user_id)
      if (!creator) {
        return { status: "clip_not_found" }
      }

      const existingConversionId = conversionIdByOrder.get(input.order_id)
      if (existingConversionId) {
        return {
          status: "ok",
          clip_id: clip.id,
          creator_user_id: creator.id,
          push_token: creator.push_token,
          conversion_recorded: false,
          reward_credited: false,
          reward_transaction: null,
          within_window: Date.now() - clip.created_at.getTime() <= EIGHT_HOURS_MS,
        }
      }

      const conversionId = crypto.randomUUID()
      conversionsById.set(conversionId, {
        id: conversionId,
        order_id: input.order_id,
        clip_id: clip.id,
        user_id: creator.id,
        created_at: now(),
      })
      conversionIdByOrder.set(input.order_id, conversionId)

      clip.conversions += 1

      const rewardTransaction = createRewardTransaction({
        user_id: creator.id,
        clip_id: clip.id,
        conversion_id: conversionId,
        order_id: input.order_id,
        type: "conversion",
        amount_cents: input.reward_cents,
        idempotency_key: `conversion:${conversionId}`,
      })

      if (!rewardTransaction) {
        throw new Error("Failed to create conversion reward transaction")
      }

      creator.earnings += input.reward_cents

      return {
        status: "ok",
        clip_id: clip.id,
        creator_user_id: creator.id,
        push_token: creator.push_token,
        conversion_recorded: true,
        reward_credited: true,
        reward_transaction: rewardTransaction,
        within_window: Date.now() - clip.created_at.getTime() <= EIGHT_HOURS_MS,
      }
    },

    async ensureCreatorWallet(userId: string): Promise<CreatorWallet> {
      const existingId = walletByUserId.get(userId)
      if (existingId) {
        const existing = wallets.get(existingId)
        if (existing) return existing
      }

      let walletCode = formatWalletCode(userId)
      if (walletByCode.has(walletCode)) {
        walletCode = `${walletCode}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
      }

      const wallet: CreatorWallet = {
        id: crypto.randomUUID(),
        user_id: userId,
        wallet_code: walletCode,
        pass_url: null,
        qr_payload: walletCode,
        created_at: now(),
      }

      wallets.set(wallet.id, wallet)
      walletByUserId.set(userId, wallet.id)
      walletByCode.set(wallet.wallet_code, wallet.id)
      return wallet
    },

    async getCreatorWalletByUserId(userId: string): Promise<CreatorWallet | null> {
      const walletId = walletByUserId.get(userId)
      return walletId ? (wallets.get(walletId) ?? null) : null
    },

    async getCreatorWalletByCode(walletCode: string): Promise<CreatorWallet | null> {
      const walletId = walletByCode.get(walletCode)
      return walletId ? (wallets.get(walletId) ?? null) : null
    },

    async updateCreatorWalletPassUrl(walletId: string, passUrl: string): Promise<CreatorWallet | null> {
      const wallet = wallets.get(walletId)
      if (!wallet) {
        return null
      }
      wallet.pass_url = passUrl
      wallets.set(wallet.id, wallet)
      return wallet
    },

    async getRewardBalances(userId: string): Promise<RewardBalances> {
      return getRewardBalances(userId)
    },

    async getRewardTransactionsByUserId(userId: string, limit = 20): Promise<RewardTransaction[]> {
      const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)))
      return Array.from(rewardTransactions.values())
        .filter((tx) => tx.user_id === userId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, normalizedLimit)
    },

    async redeemWallet(input: RedeemWalletInput): Promise<RedeemWalletResult> {
      const walletId = walletByCode.get(input.wallet_code)
      const wallet = walletId ? (wallets.get(walletId) ?? null) : null
      if (!wallet) {
        return { status: "wallet_not_found" }
      }

      const idempotencyKey = `wallet_redeem:${input.wallet_code}:${input.order_id}`
      const existingTxId = rewardTxByIdempotency.get(idempotencyKey)
      if (existingTxId) {
        const existingTx = rewardTransactions.get(existingTxId)
        if (existingTx) {
          return {
            status: "already_processed",
            wallet,
            reward_transaction: existingTx,
            balances: getRewardBalances(wallet.user_id),
          }
        }
      }

      const balancesBefore = getRewardBalances(wallet.user_id)
      if (balancesBefore.available_cents < input.amount_cents) {
        return {
          status: "insufficient_balance",
          wallet,
          available_cents: balancesBefore.available_cents,
        }
      }

      const tx = createRewardTransaction({
        user_id: wallet.user_id,
        clip_id: null,
        conversion_id: null,
        order_id: input.order_id,
        type: "wallet_redeem",
        amount_cents: -Math.abs(input.amount_cents),
        idempotency_key: idempotencyKey,
      })

      if (!tx) {
        throw new Error("Failed to create redeem transaction")
      }

      const user = users.get(wallet.user_id)
      if (user) {
        user.earnings -= input.amount_cents
      }

      return {
        status: "redeemed",
        wallet,
        reward_transaction: tx,
        balances: getRewardBalances(wallet.user_id),
      }
    },

    async getCouponsByUserId(userId: string): Promise<Coupon[]> {
      return Array.from(coupons.values()).filter((coupon) => coupon.user_id === userId)
    },

    async getCouponByCode(userId: string, code: string): Promise<Coupon | null> {
      return (
        Array.from(coupons.values()).find(
          (coupon) => coupon.user_id === userId && coupon.code === code
        ) ?? null
      )
    },

    async redeemCouponByCode(userId: string, code: string): Promise<Coupon | null> {
      const coupon =
        Array.from(coupons.values()).find(
          (value) => value.user_id === userId && value.code === code
        ) ?? null
      if (!coupon || coupon.redeemed) {
        return null
      }
      if (coupon.expires_at && coupon.expires_at.getTime() <= Date.now()) {
        return null
      }
      coupon.redeemed = true
      coupon.redeemed_at = now()
      coupons.set(coupon.id, coupon)
      return coupon
    },

    async updateCouponWalletPassUrl(couponId: string, walletPassUrl: string): Promise<Coupon | null> {
      const coupon = coupons.get(couponId)
      if (!coupon) {
        return null
      }
      coupon.wallet_pass_url = walletPassUrl
      coupons.set(coupon.id, coupon)
      return coupon
    },

    async getAvailableCouponTotals(userId: string): Promise<{ available_cents: number }> {
      const available_cents = Array.from(coupons.values())
        .filter(
          (coupon) =>
            coupon.user_id === userId &&
            !coupon.redeemed &&
            (!coupon.expires_at || coupon.expires_at.getTime() > Date.now())
        )
        .reduce((sum, coupon) => sum + coupon.value_cents, 0)
      return { available_cents }
    },
  }
}
