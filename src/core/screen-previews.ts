import 'server-only'

/**
 * Intentional error pages and the screen gallery are development tools.
 * Browser tours opt in explicitly while a real production deployment stays
 * closed even when somebody knows the URL.
 */
export function screenPreviewsEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.ENABLE_SCREEN_PREVIEWS === 'true'
}
