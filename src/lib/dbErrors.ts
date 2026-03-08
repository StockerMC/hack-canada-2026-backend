type ErrorWithCode = {
  code?: unknown
  message?: unknown
}

function asErrorWithCode(error: unknown): ErrorWithCode | null {
  if (typeof error !== "object" || error === null) {
    return null
  }
  return error as ErrorWithCode
}

export function isUniqueViolation(error: unknown): boolean {
  const parsed = asErrorWithCode(error)
  return typeof parsed?.code === "string" && parsed.code === "23505"
}

export function isWalletLedgerSchemaError(error: unknown): boolean {
  const parsed = asErrorWithCode(error)
  const code = typeof parsed?.code === "string" ? parsed.code : ""
  if (code === "42P01" || code === "42703") {
    return true
  }

  const message = typeof parsed?.message === "string" ? parsed.message.toLowerCase() : ""
  if (!message) {
    return false
  }

  return (
    message.includes("creator_wallets") ||
    message.includes("reward_transactions") ||
    message.includes("conversions") ||
    message.includes("wallet_code") ||
    message.includes("pass_url")
  )
}
