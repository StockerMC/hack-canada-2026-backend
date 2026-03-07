import { Hono } from "hono"
import type { Env } from "../types"

export function uploadRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // POST /upload-url - Get presigned R2 URL for video upload
  app.post("/", async (c) => {
    const videoId = crypto.randomUUID()
    const key = `clips/${videoId}.mp4`

    // Create a presigned URL for direct upload to R2
    // Note: R2 presigned URLs require using the S3 API compatibility
    // For now, we'll return the key and have the client upload via a PUT to our endpoint
    const uploadUrl = new URL(`/upload/${key}`, c.req.url).toString()

    return c.json({
      upload_url: uploadUrl,
      video_id: videoId,
      key: key,
      // URL where the video will be accessible after upload
      video_url: `https://videos.clipstakes.app/${key}`,
    })
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
