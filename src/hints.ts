// src/hints.ts
import { getConfig } from './config.js'

export interface ToolHints {
  next?: string
  related?: string[]
  warning?: string
}

export function buildHints(hints: ToolHints): ToolHints | undefined {
  if (!getConfig().hints.enabled) return undefined
  if (!hints.next && !hints.related?.length && !hints.warning) return undefined
  return hints
}
