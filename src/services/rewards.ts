import type { CreatorWallet, Db, RewardBalances, RewardTransaction, RewardTransactionType } from "../db"
import { WalletWalletService } from "./walletwallet"

export const REWARD_CENTS = 500

export type WalletResponse = {
  wallet_code: string
  pass_url: string | null
  qr_payload: string
}

export type BalancesResponse = {
  available_cents: number
  available_display: string
  lifetime_earned_cents: number
  lifetime_earned_display: string
}

export type RewardResponse = {
  credited_cents: number
  credited_display: string
  reason: Exclude<RewardTransactionType, "wallet_redeem">
}

export type RewardTransactionResponse = {
  id: string
  type: RewardTransactionType
  amount_cents: number
  amount_display: string
  clip_id: string | null
  order_id: string | null
  created_at: Date
}

function formatCents(cents: number): string {
  const abs = (Math.abs(cents) / 100).toFixed(2)
  return cents < 0 ? `-$${abs}` : `$${abs}`
}

function mapWallet(wallet: CreatorWallet): WalletResponse {
  return {
    wallet_code: wallet.wallet_code,
    pass_url: wallet.pass_url,
    qr_payload: wallet.qr_payload,
  }
}

function mapBalances(balances: RewardBalances): BalancesResponse {
  return {
    available_cents: balances.available_cents,
    available_display: formatCents(balances.available_cents),
    lifetime_earned_cents: balances.lifetime_earned_cents,
    lifetime_earned_display: formatCents(balances.lifetime_earned_cents),
  }
}

function mapTransaction(tx: RewardTransaction): RewardTransactionResponse {
  return {
    id: tx.id,
    type: tx.type,
    amount_cents: tx.amount_cents,
    amount_display: formatCents(tx.amount_cents),
    clip_id: tx.clip_id,
    order_id: tx.order_id,
    created_at: tx.created_at,
  }
}

export class RewardsService {
  constructor(
    private readonly db: Db,
    private readonly walletWalletService: WalletWalletService
  ) {}

  formatReward(creditedCents: number, reason: Exclude<RewardTransactionType, "wallet_redeem">): RewardResponse {
    return {
      credited_cents: creditedCents,
      credited_display: formatCents(creditedCents),
      reason,
    }
  }

  async ensureWallet(userId: string): Promise<CreatorWallet> {
    return this.db.ensureCreatorWallet(userId)
  }

  async getBalances(userId: string): Promise<BalancesResponse> {
    const balances = await this.db.getRewardBalances(userId)
    return mapBalances(balances)
  }

  async getTransactions(userId: string, limit = 20): Promise<RewardTransactionResponse[]> {
    const transactions = await this.db.getRewardTransactionsByUserId(userId, limit)
    return transactions.map(mapTransaction)
  }

  async syncWalletPass(userId: string, wallet: CreatorWallet): Promise<CreatorWallet> {
    const balances = await this.db.getRewardBalances(userId)

    const passUrl = await this.walletWalletService.createOrUpdatePassForWallet({
      walletCode: wallet.wallet_code,
      qrPayload: wallet.qr_payload,
      userId,
      balanceCents: balances.available_cents,
      existingPassUrl: wallet.pass_url,
    })

    if (!passUrl || passUrl === wallet.pass_url) {
      return wallet
    }

    const updated = await this.db.updateCreatorWalletPassUrl(wallet.id, passUrl)
    return updated ?? { ...wallet, pass_url: passUrl }
  }

  async getWalletAndBalances(userId: string): Promise<{
    wallet: WalletResponse
    balances: BalancesResponse
  }> {
    const wallet = await this.ensureWallet(userId)
    const syncedWallet = await this.syncWalletPass(userId, wallet)
    const balances = await this.getBalances(userId)

    return {
      wallet: mapWallet(syncedWallet),
      balances,
    }
  }

  async getWalletSummary(userId: string, transactionLimit = 20): Promise<{
    wallet: WalletResponse
    balances: BalancesResponse
    transactions: RewardTransactionResponse[]
  }> {
    const wallet = await this.ensureWallet(userId)
    const syncedWallet = await this.syncWalletPass(userId, wallet)
    const [balances, transactions] = await Promise.all([
      this.getBalances(userId),
      this.getTransactions(userId, transactionLimit),
    ])

    return {
      wallet: mapWallet(syncedWallet),
      balances,
      transactions,
    }
  }
}
