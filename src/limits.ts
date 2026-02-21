// src/limits.ts
export const MAX_CONTENT_SIZE = 1_000_000  // 1MB
export const MAX_TITLE_LENGTH = 200

export function validateContent(content: string): string | null {
  if (content.length > MAX_CONTENT_SIZE) {
    return `Content too large: ${content.length} characters (max: ${MAX_CONTENT_SIZE})`
  }
  return null
}

export function validateTitle(title: string): string | null {
  if (title.length > MAX_TITLE_LENGTH) {
    return `Title too long: ${title.length} characters (max: ${MAX_TITLE_LENGTH})`
  }
  return null
}
