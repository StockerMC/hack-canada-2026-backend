import { buildAbsoluteHttpsUrl, resolvePublicVideoBaseUrl } from "./urls"

/**
 * Generate a public video URL from an R2 key.
 * Defaults to the current live Worker host and can be overridden via PUBLIC_VIDEO_BASE_URL.
 */
export function getVideoUrl(
  key: string,
  publicVideoBaseUrl?: string,
  requestOrigin = "https://clipstakes.skilled5041.workers.dev"
): string {
  const baseUrl = resolvePublicVideoBaseUrl(publicVideoBaseUrl, undefined, requestOrigin)
  return buildAbsoluteHttpsUrl(baseUrl, key)
}

/**
 * Generate a unique key for a new video upload
 */
export function generateVideoKey(): { videoId: string; key: string } {
  const videoId = crypto.randomUUID()
  const key = `clips/${videoId}.mp4`
  return { videoId, key }
}

/**
 * Store video in R2
 */
export async function storeVideo(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer | ReadableStream,
  contentType = "video/mp4"
): Promise<R2Object> {
  return bucket.put(key, data, {
    httpMetadata: {
      contentType,
    },
  })
}

/**
 * Get video from R2
 */
export async function getVideo(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return bucket.get(key)
}

/**
 * Delete video from R2
 */
export async function deleteVideo(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}
