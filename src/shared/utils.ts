/**
 * Extract a human-readable error message from an unknown error value.
 */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Generate a unique ID with an optional prefix.
 * Format: `{prefix}-{timestamp}-{random}` or `{timestamp}-{random}`
 */
export function generateId(prefix?: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return prefix ? `${prefix}-${id}` : id
}
