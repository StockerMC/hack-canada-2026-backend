import { describe, test, expect } from "bun:test"
import { generateVideoKey, getVideoUrl } from "../src/lib/r2"
import { generateStorePassJson } from "../src/lib/wallet"

describe("R2 Helpers", () => {
  describe("generateVideoKey", () => {
    test("returns videoId and key", () => {
      const result = generateVideoKey()

      expect(result).toHaveProperty("videoId")
      expect(result).toHaveProperty("key")
    })

    test("generates unique video IDs", () => {
      const results = Array.from({ length: 10 }, () => generateVideoKey())
      const ids = results.map((r) => r.videoId)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(10)
    })

    test("key follows clips/:uuid.mp4 format", () => {
      const result = generateVideoKey()

      expect(result.key).toMatch(/^clips\/[a-f0-9-]+\.mp4$/)
    })

    test("key contains the video ID", () => {
      const result = generateVideoKey()

      expect(result.key).toContain(result.videoId)
    })
  })

  describe("getVideoUrl", () => {
    test("uses configured public video base when provided", () => {
      const url = getVideoUrl("clips/test.mp4", "https://cdn.example.com/videos")

      expect(url).toBe("https://cdn.example.com/videos/clips/test.mp4")
    })

    test("uses workers.dev upload path by default", () => {
      const url = getVideoUrl("clips/test.mp4")

      expect(url).toBe("https://clipstakes.skilled5041.workers.dev/upload/clips/test.mp4")
    })

    test("handles nested paths", () => {
      const url = getVideoUrl("clips/2024/03/test.mp4", "https://cdn.example.com")

      expect(url).toBe("https://cdn.example.com/clips/2024/03/test.mp4")
    })
  })
})

describe("Wallet pass payload", () => {
  test("uses branded layout without duplicated title text", () => {
    const pass = generateStorePassJson("CLIP-ABCD123", 500, {
      passTypeId: "pass.com.copped.rewards.test",
      teamId: "CLIPTEST01",
      cert: "",
      certPassword: "",
    })

    expect(pass).toMatchObject({
      organizationName: "COPPED",
      logoText: "COPPED",
      description: "Rewards Wallet",
      storeCard: {
        headerFields: [
          {
            key: "available_balance",
            label: "AVAILABLE BALANCE",
            value: "$5.00",
          },
        ],
        primaryFields: [
          {
            key: "wallet_code",
            label: "WALLET CODE",
            value: "CLIP-ABCD123",
          },
        ],
        secondaryFields: [
          {
            key: "scan_hint",
            label: "SCAN AT CHECKOUT",
            value: "Present this QR code",
          },
        ],
      },
    })
    expect(pass.storeCard.primaryFields[0].value).not.toContain("Copped Rewards")
    expect(pass.storeCard.backFields).toEqual([
      {
        key: "lifetime_earned",
        label: "LIFETIME EARNED",
        value: "$5.00",
      },
      {
        key: "wallet_code_back",
        label: "WALLET CODE",
        value: "CLIP-ABCD123",
      },
      {
        key: "help_url",
        label: "HELP",
        value: "https://copped.app/help",
        dataDetectorTypes: ["PKDataDetectorTypeLink"],
      },
    ])
  })
})
