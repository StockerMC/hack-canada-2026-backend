import JSZip from "jszip"
import forge from "node-forge"

const DEFAULT_PASS_ORGANIZATION = "ClipStakes"
const DEFAULT_PASS_DESCRIPTION = "ClipStakes Creator Rewards"
const DEFAULT_PASS_LOGO_TEXT = "ClipStakes"

// A tiny opaque PNG used as safe defaults for required pass image slots.
const DEFAULT_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2pUAAAAASUVORK5CYII="

type PkpassAssets = Record<string, Uint8Array>

export interface StorePass {
  formatVersion: 1
  passTypeIdentifier: string
  teamIdentifier: string
  serialNumber: string
  organizationName: string
  description: string
  logoText: string
  storeCard: {
    primaryFields: Array<{
      key: string
      label: string
      value: string
    }>
    secondaryFields: Array<{
      key: string
      label: string
      value: string
    }>
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

function buildStorePassPayload(identifier: string, balanceCents: number, config: WalletConfig): StorePass {
  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: identifier,
    organizationName: config.organizationName?.trim() || DEFAULT_PASS_ORGANIZATION,
    description: config.description?.trim() || DEFAULT_PASS_DESCRIPTION,
    logoText: config.logoText?.trim() || DEFAULT_PASS_LOGO_TEXT,
    storeCard: {
      primaryFields: [
        {
          key: "balance",
          label: "AVAILABLE",
          value: formatCents(balanceCents),
        },
      ],
      secondaryFields: [
        {
          key: "wallet_code",
          label: "WALLET",
          value: identifier,
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
    backgroundColor: "rgb(255, 87, 51)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(255, 255, 255)",
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
  return {
    "icon.png": iconBytes,
    "icon@2x.png": iconBytes,
    "logo.png": iconBytes,
    "logo@2x.png": iconBytes,
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
  return buildStorePassPayload(userId, earningsCents, config)
}

/**
 * Generates a real signed Apple Wallet pass (.pkpass ZIP archive).
 */
export async function generatePkpass(
  walletCode: string,
  balanceCents: number,
  config: WalletConfig
): Promise<ArrayBuffer> {
  assertSigningConfig(config)

  const pass = buildStorePassPayload(walletCode, balanceCents, config)
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
