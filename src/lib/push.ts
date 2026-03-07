import { SignJWT, importPKCS8 } from "jose"

interface ApnsConfig {
  keyId: string
  teamId: string
  privateKey: string // Base64 encoded
}

interface PushPayload {
  aps: {
    alert: {
      title: string
      body: string
    }
    sound?: string
    badge?: number
  }
  [key: string]: unknown
}

/**
 * Send push notification via APNs HTTP/2 API
 */
export async function sendPushNotification(
  deviceToken: string,
  payload: PushPayload,
  config: ApnsConfig,
  sandbox = false
): Promise<{ success: boolean; error?: string }> {
  const host = sandbox
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com"

  try {
    // Generate JWT token for APNs authentication
    const token = await generateApnsToken(config)

    const response = await fetch(`${host}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${token}`,
        "apns-topic": "com.clipstakes.app.Clip", // App Clip bundle ID
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      return { success: true }
    }

    const error = await response.text()
    return { success: false, error }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function generateApnsToken(config: ApnsConfig): Promise<string> {
  const privateKeyPem = atob(config.privateKey)
  const privateKey = await importPKCS8(privateKeyPem, "ES256")

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt()
    .sign(privateKey)

  return token
}

/**
 * Send "You earned $5!" notification to creator
 */
export async function notifyCreatorEarnings(
  pushToken: string,
  amount: number,
  config: ApnsConfig
): Promise<{ success: boolean; error?: string }> {
  const dollars = (amount / 100).toFixed(0)

  return sendPushNotification(
    pushToken,
    {
      aps: {
        alert: {
          title: "You earned money!",
          body: `You earned $${dollars}! Someone bought through your clip.`,
        },
        sound: "default",
      },
    },
    config
  )
}
