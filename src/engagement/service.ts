// src/engagement/service.ts
import * as fs from 'fs'
import * as path from 'path'
import { loadProfile, saveProfile, ensureEngagementDir } from './profile.js'
import { loadActions } from './actions.js'
import { awardXP, resolveTier, updateConsistency } from './engine.js'
import { recalculateWeekly } from './multipliers.js'
import { updateReputation } from './reputation.js'
import { migrateProfile } from './migrate.js'
import { loadEngrams } from '../engrams.js'
import { logger } from '../logger.js'
import type { EngagementProfile, EngagementConfig, XPEvent, XPResult, XPActionRegistry } from './types.js'

interface SessionXPSummary {
  total_xp: number
  base_xp: number
  multiplier: number
  events: XPEvent[]
  actions: Record<string, number>
}

export class EngagementService {
  private profile: EngagementProfile | null = null
  private sessionEvents: XPEvent[] = []
  private dirty = false
  private sessionActive = false
  private actions: XPActionRegistry | null = null
  private initialized = false

  constructor(
    public readonly basePath: string,
    private config: EngagementConfig,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled
  }

  async init(): Promise<void> {
    if (!this.isEnabled() || this.initialized) return

    ensureEngagementDir(this.basePath)

    // Check if profile exists, if not and engrams exist, migrate
    const profilePath = path.join(this.basePath, '.datacore', 'engagement', 'profile.yaml')
    const engramsPath = path.join(this.basePath, '.datacore', 'learning', 'engrams.yaml')
    // Also check core mode path
    const coreEngramsPath = path.join(this.basePath, 'engrams.yaml')

    if (!fs.existsSync(profilePath)) {
      const actualEngramsPath = fs.existsSync(engramsPath) ? engramsPath : coreEngramsPath
      if (fs.existsSync(actualEngramsPath)) {
        const engrams = loadEngrams(actualEngramsPath)
        if (engrams.length > 0) {
          this.profile = migrateProfile(this.basePath, engrams)
        } else {
          this.profile = loadProfile(this.basePath)
        }
      } else {
        this.profile = loadProfile(this.basePath)
      }
    } else {
      this.profile = loadProfile(this.basePath)
    }

    this.actions = loadActions(this.basePath)
    this.initialized = true
  }

  async award(actionKey: string, context?: Record<string, unknown>): Promise<XPResult | null> {
    if (!this.isEnabled()) return null

    // Lazy init if not initialized (non-session tool calls)
    if (!this.initialized) await this.init()
    if (!this.profile || !this.actions) return null

    const result = awardXP(this.profile, actionKey, this.actions, context)
    if (!result) return null

    this.profile = result.profile
    this.sessionEvents.push(result.event)
    this.dirty = true

    // Check tier change
    const tierResult = resolveTier(this.profile)
    let tierChange: XPResult['tier_change'] = null
    if (tierResult.changed) {
      this.profile.tier.current = tierResult.current
      const today = new Date().toISOString().split('T')[0]
      this.profile.tier.achieved_at = today
      this.profile.tier.history.push({ tier: tierResult.current, date: today })
      tierChange = {
        from: this.profile.tier.history.length > 1
          ? this.profile.tier.history[this.profile.tier.history.length - 2].tier
          : 'Seed',
        to: tierResult.current,
        message: tierResult.message!,
      }
    }

    // Auto-flush if no session active
    if (!this.sessionActive) {
      await this.flush()
    }

    return { event: result.event, tier_change: tierChange }
  }

  async flush(): Promise<void> {
    if (!this.dirty || !this.profile) return

    // Update consistency before saving
    this.profile = updateConsistency(this.profile)

    // Recalculate multipliers and weekly XP
    this.profile = recalculateWeekly(this.profile)

    // Recalculate reputation
    this.profile = updateReputation(this.profile)

    saveProfile(this.basePath, this.profile)
    this.dirty = false
  }

  getSessionSummary(): SessionXPSummary {
    const actions: Record<string, number> = {}
    let totalXP = 0
    let baseXP = 0

    for (const event of this.sessionEvents) {
      totalXP += event.xp_earned
      baseXP += event.xp_base
      actions[event.action_key] = (actions[event.action_key] ?? 0) + 1
    }

    return {
      total_xp: totalXP,
      base_xp: baseXP,
      multiplier: this.profile?.multipliers.effective ?? 1.0,
      events: [...this.sessionEvents],
      actions,
    }
  }

  getProfile(): EngagementProfile | null {
    if (!this.isEnabled()) return null
    return this.profile
  }

  markSessionActive(): void {
    this.sessionActive = true
    this.sessionEvents = []
  }

  markSessionEnded(): void {
    this.sessionActive = false
  }

  /**
   * Apply a profile transformation (e.g., from resolve, expire, challenge generation).
   * Marks profile dirty so next flush persists changes.
   */
  applyProfileUpdate(updater: (profile: EngagementProfile) => EngagementProfile): void {
    if (!this.profile) return
    this.profile = updater(this.profile)
    this.dirty = true
  }
}
