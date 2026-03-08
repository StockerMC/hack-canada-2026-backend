import forge from "node-forge"
import type { Env } from "../../src/types"

type WalletSigningOverrides = Pick<
  Env,
  | "WALLET_PASS_TYPE_ID"
  | "WALLET_TEAM_ID"
  | "WALLET_CERT"
  | "WALLET_CERT_PASSWORD"
  | "WALLET_WWDR_CERT"
  | "WALLET_ORGANIZATION_NAME"
  | "WALLET_PASS_DESCRIPTION"
  | "WALLET_PASS_LOGO_TEXT"
>

let cachedSigningOverrides: WalletSigningOverrides | null = null

function createSelfSignedCertificate(commonName: string): {
  cert: forge.pki.Certificate
  privateKey: forge.pki.PrivateKey
} {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = Math.floor(Math.random() * 1_000_000_000)
    .toString(16)
    .padStart(8, "0")

  const now = new Date()
  cert.validity.notBefore = new Date(now.getTime() - 60_000)
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  cert.setSubject([
    { name: "commonName", value: commonName },
    { name: "organizationName", value: "Copped Test" },
  ])
  cert.setIssuer([
    { name: "commonName", value: commonName },
    { name: "organizationName", value: "Copped Test" },
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    cert,
    privateKey: keys.privateKey,
  }
}

export function getWalletSigningEnvOverrides(): WalletSigningOverrides {
  if (cachedSigningOverrides) {
    return cachedSigningOverrides
  }

  const password = "test-pass-password"
  const signer = createSelfSignedCertificate("pass.com.copped.rewards.test")
  const wwdr = createSelfSignedCertificate("Apple Worldwide Developer Relations Certification Authority")
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(signer.privateKey, signer.cert, password, {
    algorithm: "3des",
    friendlyName: "Copped Test Wallet Cert",
    generateLocalKeyId: true,
  })
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()

  cachedSigningOverrides = {
    WALLET_PASS_TYPE_ID: "pass.com.copped.rewards.test",
    WALLET_TEAM_ID: "CLIPTEST01",
    WALLET_CERT: forge.util.encode64(p12Der),
    WALLET_CERT_PASSWORD: password,
    WALLET_WWDR_CERT: forge.pki.certificateToPem(wwdr.cert),
    WALLET_ORGANIZATION_NAME: "Copped Test",
    WALLET_PASS_DESCRIPTION: "Copped Test Rewards",
    WALLET_PASS_LOGO_TEXT: "Copped",
  }

  return cachedSigningOverrides
}
