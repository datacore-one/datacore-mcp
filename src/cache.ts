// src/cache.ts
import * as fs from 'fs'

const DEFAULT_TTL_MS = 60_000
const MAX_ENTRIES = 100

interface CacheEntry<T> {
  data: T
  mtime: number
  cachedAt: number
  lastUsed: number
}

export class FileCache<T> {
  private entries = new Map<string, CacheEntry<T>>()
  private ttlMs: number

  constructor(ttlMs?: number) {
    const envTtl = process.env.DATACORE_CACHE_TTL
    this.ttlMs = ttlMs ?? (envTtl ? parseInt(envTtl, 10) * 1000 : DEFAULT_TTL_MS)
  }

  get(filePath: string, loader: (path: string) => T): T {
    const now = Date.now()
    const entry = this.entries.get(filePath)

    if (entry) {
      // Check TTL
      if (now - entry.cachedAt < this.ttlMs) {
        // Check file mtime hasn't changed
        try {
          const stat = fs.statSync(filePath)
          if (stat.mtimeMs === entry.mtime) {
            entry.lastUsed = now
            return entry.data
          }
        } catch {
          // File gone — invalidate
          this.entries.delete(filePath)
        }
      }
    }

    // Cache miss or stale — reload
    const data = loader(filePath)
    let mtime = 0
    try {
      mtime = fs.statSync(filePath).mtimeMs
    } catch { /* file may not exist */ }

    this.entries.set(filePath, { data, mtime, cachedAt: now, lastUsed: now })
    this.evictIfNeeded()
    return data
  }

  invalidate(filePath?: string): void {
    if (filePath) {
      this.entries.delete(filePath)
    } else {
      this.entries.clear()
    }
  }

  get size(): number {
    return this.entries.size
  }

  private evictIfNeeded(): void {
    if (this.entries.size <= MAX_ENTRIES) return

    // Evict least recently used entries
    const sorted = [...this.entries.entries()]
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)

    const toEvict = sorted.slice(0, this.entries.size - MAX_ENTRIES)
    for (const [key] of toEvict) {
      this.entries.delete(key)
    }
  }
}
