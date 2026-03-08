import { Hono } from "hono"
import type { Env } from "../types"
import { buildAbsoluteHttpsUrl, resolvePublicApiBaseUrl, resolvePublicVideoBaseUrl } from "../lib/urls"

type ParsedByteRange =
  | { ok: true; offset: number; length: number; start: number; end: number }
  | { ok: false }

function parseByteRangeHeader(rangeHeader: string, size: number): ParsedByteRange {
  const unitPrefix = "bytes="
  if (!rangeHeader.startsWith(unitPrefix)) return { ok: false }

  const spec = rangeHeader.slice(unitPrefix.length).trim()
  if (!spec || spec.includes(",")) return { ok: false }
  if (size <= 0) return { ok: false }

  const [rawStart, rawEnd] = spec.split("-", 2)
  if (rawStart === undefined || rawEnd === undefined) return { ok: false }

  // Suffix byte range: bytes=-N
  if (rawStart === "") {
    if (!/^\d+$/.test(rawEnd)) return { ok: false }
    const suffixLength = Number(rawEnd)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { ok: false }

    const length = Math.min(suffixLength, size)
    const start = size - length
    const end = size - 1
    return { ok: true, offset: start, length, start, end }
  }

  if (!/^\d+$/.test(rawStart)) return { ok: false }
  const start = Number(rawStart)
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return { ok: false }

  // Open-ended byte range: bytes=N-
  if (rawEnd === "") {
    const end = size - 1
    const length = end - start + 1
    return { ok: true, offset: start, length, start, end }
  }

  if (!/^\d+$/.test(rawEnd)) return { ok: false }
  const requestedEnd = Number(rawEnd)
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { ok: false }

  const end = Math.min(requestedEnd, size - 1)
  const length = end - start + 1
  return { ok: true, offset: start, length, start, end }
}

function setVideoResponseHeaders(object: R2Object, headers: Headers): void {
  object.writeHttpMetadata(headers)
  headers.set("ETag", object.httpEtag)
  headers.set("Cache-Control", "public, max-age=31536000, immutable")
  headers.set("Accept-Ranges", "bytes")
}

export function uploadRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // POST /upload-url - Get presigned R2 URL for video upload
  app.post("/", async (c) => {
    const videoId = crypto.randomUUID()
    const key = `clips/${videoId}.mp4`
    const requestOrigin = new URL(c.req.url).origin
    const publicApiBaseUrl = resolvePublicApiBaseUrl(c.env.PUBLIC_API_BASE_URL, requestOrigin)
    const publicVideoBaseUrl = resolvePublicVideoBaseUrl(
      c.env.PUBLIC_VIDEO_BASE_URL,
      c.env.PUBLIC_API_BASE_URL,
      requestOrigin
    )

    // Use backend-controlled absolute HTTPS URLs for both upload and playback paths.
    const uploadUrl = buildAbsoluteHttpsUrl(publicApiBaseUrl, `upload/${key}`)
    const videoUrl = buildAbsoluteHttpsUrl(publicVideoBaseUrl, key)

    return c.json({
      upload_url: uploadUrl,
      video_id: videoId,
      key: key,
      video_url: videoUrl,
    })
  })

  // GET /upload/:key+ - Public playback endpoint backed by R2
  app.get("/:key{.+}", async (c) => {
    const key = c.req.param("key")
    const rangeHeader = c.req.header("range")

    if (!rangeHeader) {
      const object = await c.env.VIDEOS.get(key)

      if (!object) {
        return c.json({ error: "Video not found" }, 404)
      }

      const headers = new Headers()
      setVideoResponseHeaders(object, headers)
      headers.set("Content-Length", String(object.size))

      return new Response(object.body, { status: 200, headers })
    }

    const metadata = await c.env.VIDEOS.head(key)
    if (!metadata) {
      return c.json({ error: "Video not found" }, 404)
    }

    const parsedRange = parseByteRangeHeader(rangeHeader, metadata.size)
    if (!parsedRange.ok) {
      const headers = new Headers()
      setVideoResponseHeaders(metadata, headers)
      headers.set("Content-Range", `bytes */${metadata.size}`)
      headers.set("Content-Length", "0")
      return new Response(null, { status: 416, headers })
    }

    const object = await c.env.VIDEOS.get(key, {
      range: {
        offset: parsedRange.offset,
        length: parsedRange.length,
      },
    })
    if (!object) {
      return c.json({ error: "Video not found" }, 404)
    }

    const headers = new Headers()
    setVideoResponseHeaders(object, headers)
    headers.set("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${metadata.size}`)
    headers.set("Content-Length", String(parsedRange.length))

    return new Response(object.body, { status: 206, headers })
  })

  // PUT /upload/:key+ - Direct upload endpoint (proxies to R2)
  app.put("/:key{.+}", async (c) => {
    const key = c.req.param("key")
    const body = await c.req.arrayBuffer()

    await c.env.VIDEOS.put(key, body, {
      httpMetadata: {
        contentType: "video/mp4",
      },
    })

    return c.json({ success: true, key })
  })

  return app
}
