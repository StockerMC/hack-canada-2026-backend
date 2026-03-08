import { describe, expect, test } from "bun:test"
import { createInMemoryDb } from "./helpers/inMemoryDb"

describe("DB wallet-ledger primitives", () => {
  test("createClipWithReceiptAndReward credits once and locks receipt", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)
    const receipt = await db.createReceipt(["product-1"])

    const first = await db.createClipWithReceiptAndReward({
      user_id: user.id,
      receipt_id: receipt.id,
      product_id: "product-1",
      video_url: "https://clipstakes.skilled5041.workers.dev/upload/clips/new.mp4",
      reward_cents: 500,
    })

    const second = await db.createClipWithReceiptAndReward({
      user_id: user.id,
      receipt_id: receipt.id,
      product_id: "product-1",
      video_url: "https://clipstakes.skilled5041.workers.dev/upload/clips/new-2.mp4",
      reward_cents: 500,
    })

    expect(first.status).toBe("created")
    expect(second.status).toBe("receipt_already_used")

    const balances = await db.getRewardBalances(user.id)
    expect(balances.available_cents).toBe(500)
    expect(balances.lifetime_earned_cents).toBe(500)
  })

  test("processConversionReward dedupes by order id", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)

    const clipCreation = await db.createClipAndReward({
      user_id: user.id,
      product_id: "product-1",
      video_url: "https://clipstakes.skilled5041.workers.dev/upload/clips/clip.mp4",
      reward_cents: 500,
    })

    const first = await db.processConversionReward({
      clip_id: clipCreation.clip.id,
      order_id: "order-1",
      reward_cents: 500,
    })

    const duplicate = await db.processConversionReward({
      clip_id: clipCreation.clip.id,
      order_id: "order-1",
      reward_cents: 500,
    })

    expect(first.status).toBe("ok")
    if (first.status !== "ok") return

    expect(first.reward_credited).toBe(true)
    expect(duplicate.status).toBe("ok")
    if (duplicate.status !== "ok") return

    expect(duplicate.reward_credited).toBe(false)

    const balances = await db.getRewardBalances(user.id)
    expect(balances.available_cents).toBe(1000)
  })

  test("post-8h conversion is still credited", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)

    const clipCreation = await db.createClipAndReward({
      user_id: user.id,
      product_id: "product-1",
      video_url: "https://clipstakes.skilled5041.workers.dev/upload/clips/clip.mp4",
      reward_cents: 500,
    })

    const clip = await db.getClipById(clipCreation.clip.id)
    if (!clip) throw new Error("Clip missing")
    clip.created_at = new Date(Date.now() - 9 * 60 * 60 * 1000)

    const conversion = await db.processConversionReward({
      clip_id: clip.id,
      order_id: "order-late",
      reward_cents: 500,
    })

    expect(conversion.status).toBe("ok")
    if (conversion.status !== "ok") return

    expect(conversion.reward_credited).toBe(true)
    expect(conversion.within_window).toBe(false)

    const balances = await db.getRewardBalances(user.id)
    expect(balances.available_cents).toBe(1000)
  })

  test("redeemWallet prevents overdraft and supports idempotent retries", async () => {
    const db = createInMemoryDb()
    const user = await db.createUser("device-1", null)

    await db.createClipAndReward({
      user_id: user.id,
      product_id: "product-1",
      video_url: "https://clipstakes.skilled5041.workers.dev/upload/clips/clip.mp4",
      reward_cents: 500,
    })

    const wallet = await db.ensureCreatorWallet(user.id)

    const redeemed = await db.redeemWallet({
      wallet_code: wallet.wallet_code,
      amount_cents: 300,
      order_id: "pos-1",
    })

    expect(redeemed.status).toBe("redeemed")
    if (redeemed.status !== "redeemed") return
    expect(redeemed.balances.available_cents).toBe(200)

    const retry = await db.redeemWallet({
      wallet_code: wallet.wallet_code,
      amount_cents: 300,
      order_id: "pos-1",
    })
    expect(retry.status).toBe("already_processed")

    const overdraft = await db.redeemWallet({
      wallet_code: wallet.wallet_code,
      amount_cents: 999,
      order_id: "pos-2",
    })
    expect(overdraft.status).toBe("insufficient_balance")
  })
})
