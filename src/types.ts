export interface Env {
  // R2 bucket for video storage
  VIDEOS: R2Bucket

  // Neon Postgres connection
  DATABASE_URL: string

  // Shopify webhook verification
  SHOPIFY_WEBHOOK_SECRET: string

  // APNs push notifications
  APNS_KEY_ID?: string
  APNS_TEAM_ID?: string
  APNS_PRIVATE_KEY?: string

  // Apple Wallet pass generation
  WALLET_PASS_TYPE_ID?: string
  WALLET_TEAM_ID?: string
  WALLET_CERT?: string
  WALLET_CERT_PASSWORD?: string

  // WalletWallet API integration (server-side only)
  WALLETWALLET_API_KEY?: string
  WALLETWALLET_BASE_URL?: string
  WALLETWALLET_TEMPLATE_ID?: string
}
