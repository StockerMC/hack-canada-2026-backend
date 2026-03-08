const ABSOLUTE_URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//

function toUrl(raw: string | undefined): URL | null {
  const value = raw?.trim()
  if (!value) {
    return null
  }

  const candidate = ABSOLUTE_URL_SCHEME.test(value) ? value : `https://${value}`
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

function normalizeBase(url: URL): string {
  url.protocol = "https:"
  url.hash = ""
  url.search = ""
  return url.toString().replace(/\/+$/, "")
}

export function resolvePublicApiBaseUrl(publicApiBaseUrl: string | undefined, requestOrigin: string): string {
  const resolved = toUrl(publicApiBaseUrl) ?? toUrl(requestOrigin)
  if (!resolved) {
    throw new Error("Unable to resolve public API base URL")
  }

  return normalizeBase(resolved)
}

export function resolvePublicVideoBaseUrl(
  publicVideoBaseUrl: string | undefined,
  publicApiBaseUrl: string | undefined,
  requestOrigin: string
): string {
  const configured = toUrl(publicVideoBaseUrl)
  if (configured) {
    return normalizeBase(configured)
  }

  return `${resolvePublicApiBaseUrl(publicApiBaseUrl, requestOrigin)}/upload`
}

export function buildAbsoluteHttpsUrl(baseUrl: string, path: string): string {
  const encodedPath = path
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  const url = new URL(encodedPath, `${baseUrl.replace(/\/+$/, "")}/`)
  url.protocol = "https:"
  return url.toString()
}
