import JSZip from "jszip"
import forge from "node-forge"

const DEFAULT_PASS_ORGANIZATION = "COPPED"
const DEFAULT_PASS_DESCRIPTION = "Rewards Wallet"
const DEFAULT_PASS_LOGO_TEXT = "COPPED"
const DEFAULT_HELP_URL = "https://copped.app/help"
const DEFAULT_BACKGROUND_COLOR = "rgb(12, 16, 28)"
const DEFAULT_FOREGROUND_COLOR = "rgb(255, 255, 255)"
const DEFAULT_LABEL_COLOR = "rgb(255, 164, 138)"

const DEFAULT_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAYAAABWk2cPAAAA7klEQVR42mPkE5L5z0BnwMQwAIAFlwQbBw9VLPj14wtxPqWWhbjMYqKlhbjMZKK1hdjMZqKHheh2DK7U+zpSBYUvuvwOw+tpBahiWROIVkdyPhVdfgdTDM0gUtQxEeNLBgYGDNeToo7kEonavsRqKa19ycDAwMAIK/DpkWVgxeKAZBmSLH147/rAVG0P712n2HKyg5cSyymOU3Isp1pCIsVyFmpZKq+kSXmBT6llyIUHemnFRIllxFiIjc9Cy2AkmJCwtdqobSHMDiZCzUVyAHocii6/g2I2I7YWPrULf3TPMBHbQKZmY5uFFMXUAgD4umjRke2pfAAAAABJRU5ErkJggg=="
const DEFAULT_ICON_2X_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAABL0lEQVR42u2asQoCMQyGWxFxEAfBTRDExUfyFZx8FCdfwUe6RQ5udnUQFx2kooVrWm1p2vxZmwuXfqTN/Rc9nS0eSoANlBBDorXZMPSB0XjCKoH77QqiPxHlRtJ+L4osiHInGUoWREsh6UtWLtFSSVJk0QIiUSm97mW7dq7PT+eX33Hv9tsdksQD0ViBzM6TfsTOp4oHoqG1+fYjailVPBCNVaPcaxNEa6tNcUS1rdTX8vWiLJUQTT0SRaLf1rWN6toGRIv9enGR/bTlagOiRRPlQhhEayMMorURBtFchhotnWgowT6FgtKaQJRbDVJak1nvIwui3E9RnLq+RI1q9q8amJuk2KkUTU1gc9N5qXtU/OSY9p2p567gY7oz9B6NdRpjAptbZ+S7gwr/XvLYE1nebkfph+EkAAAAAElFTkSuQmCC"
const DEFAULT_LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAKAAAAAyCAYAAADbYdBlAAAB4UlEQVR42u2dsUoDQRRF3w5biEUMYiESRC1s/Ro/QEijhbWfsLWFNgE/wK9JmyKCiKQUC7EQ10rQbIK76sydmZxTLoFNZk/uvJld9hW9zUFtCyhcaQD/Rf3+tvB4iXgQgk+v5kV0yAcKERsCIh8oJHTIB0oJHUMBShzpB8oUJAFBm4AMASj51fy7tt7z/sVeX565OggYXrz5cyEiU3Bw+WI4L0QkoFoCJCQBATQCxpI+pCAJCBDHNoyZ2ex4t3Fs+/beZpdnzePnV50//1ceH+64up7YGeyTgMiXx/i63NIP+dKSkBoQ0lqExF77AavgbApk8D/OxcbWXm2J7L91uS9MLZjGn7xkkCCbKXg6GTOioK0Bp5MxIoJ+EYKIEEUN+FXCg8OjYD/saXTB1W1Bf1itzjZMqFREvnTGSrIP6FNE5EtrzCTbMCGnYuBOyDfxfMunrmmoAyNLQEXa9YcVU3Eif9gy12mWJLTV3IahvgNZDYh8wMMIZnZySv13c13lkYCxvBqj7fdAvrTGgUfyIX4B1SnIC4pYhMgk6HreVGofakBr90i+8X5AiG0VjBzAIgTyEHBZDy8AC9A/jgQE/RRMCoKqe6b7qZ0mgM/Wra5NT1cAX32Dy2UfoIUXhGhY/QESobb2MGArgAAAAABJRU5ErkJggg=="
const DEFAULT_LOGO_2X_PNG_BASE64 =
  "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"

type PkpassAssets = Record<string, Uint8Array>

interface StorePassField {
  key: string
  label: string
  value: string
  dataDetectorTypes?: string[]
}

export interface StorePass {
  formatVersion: 1
  passTypeIdentifier: string
  teamIdentifier: string
  serialNumber: string
  organizationName: string
  description: string
  logoText: string
  storeCard: {
    headerFields: StorePassField[]
    primaryFields: StorePassField[]
    secondaryFields: StorePassField[]
    backFields: StorePassField[]
  }
  barcode: {
    message: string
    format: "PKBarcodeFormatQR"
    messageEncoding: "iso-8859-1"
  }
  barcodes: Array<{
    message: string
    format: "PKBarcodeFormatQR"
    messageEncoding: "iso-8859-1"
  }>
  backgroundColor: string
  foregroundColor: string
  labelColor: string
}

export interface WalletConfig {
  passTypeId: string
  teamId: string
  cert: string // Base64-encoded PKCS#12 bundle for the pass type cert.
  certPassword: string
  wwdrCert?: string // PEM or base64-encoded PEM for WWDR intermediate cert.
  organizationName?: string
  description?: string
  logoText?: string
  supportUrl?: string
}

export class WalletPassConfigError extends Error {
  constructor(
    message: string,
    readonly missingKeys: string[]
  ) {
    super(message)
    this.name = "WalletPassConfigError"
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function buildStorePassPayload(
  identifier: string,
  balanceCents: number,
  lifetimeEarnedCents: number,
  config: WalletConfig
): StorePass {
  const availableBalance = formatCents(balanceCents)
  const supportUrl = config.supportUrl?.trim() || DEFAULT_HELP_URL

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: identifier,
    organizationName: DEFAULT_PASS_ORGANIZATION,
    description: DEFAULT_PASS_DESCRIPTION,
    logoText: DEFAULT_PASS_LOGO_TEXT,
    storeCard: {
      headerFields: [
        {
          key: "available_balance",
          label: "AVAILABLE BALANCE",
          value: availableBalance,
        },
      ],
      primaryFields: [
        {
          key: "wallet_code",
          label: "WALLET CODE",
          value: identifier,
        },
      ],
      secondaryFields: [
        {
          key: "scan_hint",
          label: "SCAN AT CHECKOUT",
          value: "Present this QR code",
        },
      ],
      backFields: [
        {
          key: "lifetime_earned",
          label: "LIFETIME EARNED",
          value: formatCents(lifetimeEarnedCents),
        },
        {
          key: "wallet_code_back",
          label: "WALLET CODE",
          value: identifier,
        },
        {
          key: "help_url",
          label: "HELP",
          value: supportUrl,
          dataDetectorTypes: ["PKDataDetectorTypeLink"],
        },
      ],
    },
    barcode: {
      message: identifier,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    },
    barcodes: [
      {
        message: identifier,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
      },
    ],
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    foregroundColor: DEFAULT_FOREGROUND_COLOR,
    labelColor: DEFAULT_LABEL_COLOR,
  }
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff
  }
  return bytes
}

function bytesToBinary(bytes: Uint8Array): string {
  let output = ""
  for (let i = 0; i < bytes.length; i += 1) {
    output += String.fromCharCode(bytes[i])
  }
  return output
}

function decodeBase64ToBytes(raw: string): Uint8Array {
  const normalized = raw.replace(/\s+/g, "")
  if (!normalized) {
    throw new Error("Empty base64 payload")
  }

  try {
    return binaryToBytes(atob(normalized))
  } catch {
    throw new Error("Invalid base64 payload")
  }
}

function normalizePem(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error("Empty certificate payload")
  }

  if (trimmed.includes("-----BEGIN CERTIFICATE-----")) {
    return trimmed
  }

  const decoded = new TextDecoder().decode(decodeBase64ToBytes(trimmed))
  if (!decoded.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("Certificate must be PEM or base64-encoded PEM")
  }
  return decoded.trim()
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const clone = new Uint8Array(bytes.byteLength)
  clone.set(bytes)
  return clone.buffer
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", bytes)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function assertSigningConfig(config: WalletConfig): void {
  const missing: string[] = []
  if (!config.passTypeId?.trim()) {
    missing.push("WALLET_PASS_TYPE_ID")
  }
  if (!config.teamId?.trim()) {
    missing.push("WALLET_TEAM_ID")
  }
  if (!config.cert?.trim()) {
    missing.push("WALLET_CERT")
  }
  if (!config.wwdrCert?.trim()) {
    missing.push("WALLET_WWDR_CERT")
  }
  if (missing.length > 0) {
    throw new WalletPassConfigError("Wallet pass signing is not configured", missing)
  }
}

function parseSigningMaterial(config: WalletConfig): {
  privateKey: forge.pki.PrivateKey
  signingCert: forge.pki.Certificate
  wwdrCert: forge.pki.Certificate
  certChain: forge.pki.Certificate[]
} {
  const p12Bytes = decodeBase64ToBytes(config.cert)
  const p12Binary = bytesToBinary(p12Bytes)

  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Binary, "raw"))
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, config.certPassword ?? "")
  } catch {
    throw new Error("Failed to parse WALLET_CERT as PKCS#12")
  }

  const keyBags =
    (p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    })[forge.pki.oids.pkcs8ShroudedKeyBag] as Array<any>) ?? []
  const keyBag = keyBags[0]
  if (!keyBag?.key) {
    throw new Error("No private key found in WALLET_CERT")
  }

  const certBags =
    (p12.getBags({
      bagType: forge.pki.oids.certBag,
    })[forge.pki.oids.certBag] as Array<any>) ?? []
  if (certBags.length === 0) {
    throw new Error("No certificate found in WALLET_CERT")
  }

  const keyLocalKeyId = keyBag.attributes?.localKeyId?.[0]
  const keyLocalKeyIdHex = keyLocalKeyId ? forge.util.bytesToHex(keyLocalKeyId) : null

  const matchingCertBag =
    certBags.find((bag: any) => {
      if (!keyLocalKeyIdHex) {
        return false
      }
      const candidate = bag.attributes?.localKeyId?.[0]
      return candidate ? forge.util.bytesToHex(candidate) === keyLocalKeyIdHex : false
    }) ?? certBags[0]

  const signingCert = matchingCertBag.cert
  if (!signingCert) {
    throw new Error("No signing certificate found in WALLET_CERT")
  }

  let wwdrCert: forge.pki.Certificate
  try {
    wwdrCert = forge.pki.certificateFromPem(normalizePem(config.wwdrCert ?? ""))
  } catch {
    throw new Error("Failed to parse WALLET_WWDR_CERT")
  }

  const certChain = certBags
    .map((bag: any) => bag.cert as forge.pki.Certificate | undefined)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert))
    .filter((cert) => cert.serialNumber !== signingCert.serialNumber)

  return {
    privateKey: keyBag.key as forge.pki.PrivateKey,
    signingCert,
    wwdrCert,
    certChain,
  }
}

function signManifest(manifestBytes: Uint8Array, config: WalletConfig): Uint8Array {
  const signing = parseSigningMaterial(config)
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(bytesToBinary(manifestBytes), "raw")
  p7.addCertificate(signing.signingCert)
  p7.addCertificate(signing.wwdrCert)
  for (const cert of signing.certChain) {
    p7.addCertificate(cert)
  }

  p7.addSigner({
    key: signing.privateKey as any,
    certificate: signing.signingCert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date() as any,
      },
    ],
  })

  p7.sign({ detached: true })
  return binaryToBytes(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

function buildDefaultAssets(): PkpassAssets {
  const iconBytes = decodeBase64ToBytes(DEFAULT_ICON_PNG_BASE64)
  const icon2xBytes = decodeBase64ToBytes(DEFAULT_ICON_2X_PNG_BASE64)
  const logoBytes = decodeBase64ToBytes(DEFAULT_LOGO_PNG_BASE64)
  const logo2xBytes = decodeBase64ToBytes(DEFAULT_LOGO_2X_PNG_BASE64)
  return {
    "icon.png": iconBytes,
    "icon@2x.png": icon2xBytes,
    "logo.png": logoBytes,
    "logo@2x.png": logo2xBytes,
  }
}

/**
 * Generate pass.json structure for the legacy wallet endpoint.
 */
export function generateStorePassJson(
  userId: string,
  earningsCents: number,
  config: WalletConfig
): StorePass {
  return buildStorePassPayload(userId, earningsCents, earningsCents, config)
}

/**
 * Generates a real signed Apple Wallet pass (.pkpass ZIP archive).
 */
export async function generatePkpass(
  walletCode: string,
  balanceCents: number,
  config: WalletConfig,
  options?: {
    lifetimeEarnedCents?: number
  }
): Promise<ArrayBuffer> {
  assertSigningConfig(config)

  const pass = buildStorePassPayload(
    walletCode,
    balanceCents,
    options?.lifetimeEarnedCents ?? balanceCents,
    config
  )
  const passBytes = new TextEncoder().encode(JSON.stringify(pass))
  const assets = buildDefaultAssets()

  const manifest: Record<string, string> = {
    "pass.json": await sha1Hex(passBytes),
  }
  for (const [filename, fileBytes] of Object.entries(assets)) {
    manifest[filename] = await sha1Hex(fileBytes)
  }

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest))
  const signatureBytes = signManifest(manifestBytes, config)

  const zip = new JSZip()
  zip.file("pass.json", passBytes)
  for (const [filename, fileBytes] of Object.entries(assets)) {
    zip.file(filename, fileBytes)
  }
  zip.file("manifest.json", manifestBytes)
  zip.file("signature", signatureBytes)

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  })

  return toArrayBuffer(archive)
}
