import { Hono } from "hono"
import type { Env } from "../types"
import { buildAbsoluteHttpsUrl, resolvePublicApiBaseUrl, resolvePublicVideoBaseUrl } from "../lib/urls"

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
    const object = await c.env.VIDEOS.get(key)

    if (!object) {
      return c.json({ error: "Video not found" }, 404)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("ETag", object.httpEtag)
    headers.set("Cache-Control", "public, max-age=31536000, immutable")

    return new Response(object.body, { headers })
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
