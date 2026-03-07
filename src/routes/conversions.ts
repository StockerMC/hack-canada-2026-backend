import { Hono } from "hono"
import { z } from "zod"
import type { Env } from "../types"
import type { Db } from "../db"
import { verifyShopifyWebhook, extractClipAttribution, type ShopifyOrder } from "../lib/shopify"
import { ConversionService } from "../services/conversions"
import { RewardsService } from "../services/rewards"
import { WalletWalletService } from "../services/walletwallet"

const conversionsDevSchema = z.object({
  clip_id: z.string().min(1),
  order_id: z.string().min(1),
})

function extractOrderId(order: ShopifyOrder): string | null {
  if (typeof order.id === "number") return String(order.id)
  if (typeof order.order_number === "number") return String(order.order_number)
  return null
}

function getConversionService(db: Db, env: Env): ConversionService {
  const rewardsService = new RewardsService(db, new WalletWalletService(env))
  return new ConversionService(db, rewardsService)
}

export function conversionsRoutes(db: Db) {
  const app = new Hono<{ Bindings: Env }>()

  // POST /conversions - Shopify webhook for order creation
  app.post("/", async (c) => {
    const signature = c.req.header("X-Shopify-Hmac-Sha256")
    if (!signature) {
      return c.json({ error: "Missing signature" }, 401)
    }

    const body = await c.req.text()
    const isValid = await verifyShopifyWebhook(body, signature, c.env.SHOPIFY_WEBHOOK_SECRET)
    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401)
    }

    let order: ShopifyOrder
    try {
      order = JSON.parse(body) as ShopifyOrder
    } catch {
      return c.json({ error: "Invalid webhook payload" }, 400)
    }

    const clipId = extractClipAttribution(order)
    if (!clipId) {
      return c.json({ success: true, attributed: false })
    }

    const orderId = extractOrderId(order)
    if (!orderId) {
      return c.json({ error: "Missing order id in webhook payload" }, 400)
    }

    const conversionService = getConversionService(db, c.env)
    const result = await conversionService.processConversionForClip(clipId, orderId, c.env)
    if (result.status === "clip_not_found") {
      return c.json({ error: "Clip not found" }, 404)
    }

    return c.json({
      success: true,
      attributed: true,
      clip_id: result.clip_id,
      earnings_added: result.earnings_added,
      bonus_coupon_created: result.bonus_coupon_created,
      bonus_coupon: result.bonus_coupon ?? undefined,
    })
  })

  // POST /conversions/dev - Dev endpoint without Shopify webhook signature verification
  app.post("/dev", async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid request body" }, 400)
    }

    const parsed = conversionsDevSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400)
    }

    const conversionService = getConversionService(db, c.env)
    const result = await conversionService.processConversionForClip(
      parsed.data.clip_id,
      parsed.data.order_id,
      c.env
    )
    if (result.status === "clip_not_found") {
      return c.json({ error: "Clip not found" }, 404)
    }

    return c.json({
      success: true,
      attributed: true,
      clip_id: result.clip_id,
      bonus_coupon_created: result.bonus_coupon_created,
      bonus_coupon: result.bonus_coupon ?? undefined,
    })
  })

  return app
}
