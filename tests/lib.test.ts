import { describe, test, expect } from "bun:test"
import { generateVideoKey, getVideoUrl } from "../src/lib/r2"

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
    test("uses custom domain when provided", () => {
      const url = getVideoUrl("clips/test.mp4", "cdn.example.com")

      expect(url).toBe("https://cdn.example.com/clips/test.mp4")
    })

    test("uses default domain when no custom domain", () => {
      const url = getVideoUrl("clips/test.mp4")

      expect(url).toBe("https://videos.clipstakes.app/clips/test.mp4")
    })

    test("handles nested paths", () => {
      const url = getVideoUrl("clips/2024/03/test.mp4", "cdn.example.com")

      expect(url).toBe("https://cdn.example.com/clips/2024/03/test.mp4")
    })
  })
})
