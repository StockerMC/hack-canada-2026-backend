import { timingSafeEqual } from "node:crypto"

/**
 * Verify Shopify webhook HMAC signature
 */
export async function verifyShopifyWebhook(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

  // Timing-safe comparison
  const sigA = encoder.encode(computedSignature)
  const sigB = encoder.encode(signature)

  if (sigA.length !== sigB.length) {
    return false
  }

  return timingSafeEqual(sigA, sigB)
}

export interface ShopifyOrder {
  id?: number
  order_number?: number
  line_items: Array<{
    product_id: number
    variant_id: number
    title: string
    quantity: number
    price: string
  }>
  note_attributes?: Array<{
    name: string
    value: string
  }>
  customer: {
    id: number
    email: string
  }
}

/**
 * Extract clip attribution from Shopify order
 * The iOS app should pass clip_id in note_attributes when creating checkout
 */
export function extractClipAttribution(order: ShopifyOrder): string | null {
  const noteAttributes = Array.isArray(order.note_attributes) ? order.note_attributes : []
  const clipAttr = noteAttributes.find((attr) => attr.name === "clip_id")
  return clipAttr?.value ?? null
}
