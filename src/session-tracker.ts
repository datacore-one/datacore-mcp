// src/session-tracker.ts
// In-memory session co-access tracker. Lost on crash = acceptable per DIP-0019.
// Tracks which engrams were injected together in a session so we can
// write Hebbian co-access associations at session.end.

import { SessionBreadcrumbs } from './session-state.js'

export class SessionTracker {
  private sessions = new Map<string, Set<string>>()
  private breadcrumbs = new Map<string, SessionBreadcrumbs>()

  trackInjected(sessionId: string, engramIds: string[]): void {
    if (!sessionId || engramIds.length === 0) return
    let set = this.sessions.get(sessionId)
    if (!set) {
      set = new Set()
      this.sessions.set(sessionId, set)
    }
    for (const id of engramIds) {
      set.add(id)
    }
  }

  getCoAccessPairs(sessionId: string): Array<[string, string]> {
    const set = this.sessions.get(sessionId)
    if (!set || set.size < 2) return []

    const ids = Array.from(set).sort() // sorted for deterministic pairs
    const pairs: Array<[string, string]> = []
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs.push([ids[i], ids[j]])
      }
    }
    return pairs
  }

  getInjectedIds(sessionId: string): string[] {
    const set = this.sessions.get(sessionId)
    return set ? Array.from(set) : []
  }

  initBreadcrumbs(sessionId: string): void {
    this.breadcrumbs.set(sessionId, new SessionBreadcrumbs())
  }

  getBreadcrumbs(sessionId: string): SessionBreadcrumbs | undefined {
    return this.breadcrumbs.get(sessionId)
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.breadcrumbs.delete(sessionId)
  }

  get size(): number {
    return this.sessions.size
  }
}
