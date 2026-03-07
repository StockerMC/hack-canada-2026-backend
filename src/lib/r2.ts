/**
 * Generate a video URL from R2 key
 * In production, this would be a custom domain or R2 public URL
 */
export function getVideoUrl(key: string, customDomain?: string): string {
  if (customDomain) {
    return `https://${customDomain}/${key}`
  }
  // Default to a placeholder - configure with actual R2 public URL
  return `https://videos.clipstakes.app/${key}`
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
