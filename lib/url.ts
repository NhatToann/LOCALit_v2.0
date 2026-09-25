/**
 * Safely resolve an avatar URL for rendering in an <img> tag.
 * Returns null if the URL is unsafe (javascript:, data:, vbscript:, file:, etc.).
 */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // Reject dangerous schemes
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('about:')
  ) {
    return null
  }

  // Must be http(s) or a relative path
  if (!lower.startsWith('http://') && !lower.startsWith('https://') && !lower.startsWith('/')) {
    return null
  }

  return trimmed
}
