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
  WALLET_WWDR_CERT?: string
  WALLET_ORGANIZATION_NAME?: string
  WALLET_PASS_DESCRIPTION?: string
  WALLET_PASS_LOGO_TEXT?: string

  // WalletWallet API integration (server-side only)
  WALLETWALLET_API_KEY?: string
  WALLETWALLET_BASE_URL?: string

  // Canonical public API base URL used when generating public links
  // e.g. https://api.clipstakes.app
  PUBLIC_API_BASE_URL?: string

  // Canonical public video base URL used when generating video_url links
  // e.g. https://videos.example.com/clips
  PUBLIC_VIDEO_BASE_URL?: string
}
