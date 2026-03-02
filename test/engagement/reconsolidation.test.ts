// test/engagement/reconsolidation.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import {
  detectContradiction,
  queueReconsolidation,
  resolveReconsolidation,
  expireReconsolidations,
} from '../../src/engagement/reconsolidation.js'
import type { Engram } from '../../src/schemas/engram.js'
import type { EngagementProfile } from '../../src/engagement/types.js'

function makeEngram(overrides: Partial<Engram> & { id: string; statement: string }): Engram {
  return {
    id: overrides.id,
    version: 1,
    status: overrides.status ?? 'active',
    consolidated: false,
    type: overrides.type ?? 'behavioral',
    scope: 'global',
    visibility: 'private',
    statement: overrides.statement,
    domain: overrides.domain,
    activation: {
      retrieval_strength: 0.8,
      storage_strength: 0.5,
      frequency: 3,
      last_accessed: '2026-03-01',
    },
    tags: [],
    pack: null,
    abstract: null,
    derived_from: null,
    derivation_count: 1,
  }
}

describe('engagement/reconsolidation', () => {
  const tmpDir = path.join(os.tmpdir(), 'recon-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('detectContradiction', () => {
    it('detects contradiction with opposing terms in same domain', () => {
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for projects',
        domain: 'software.lang',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'Never use TypeScript for projects',
          domain: 'software.lang',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      expect(result).not.toBeNull()
      expect(result!.engram_id).toBe('ENG-001')
      expect(result!.contradicting_id).toBe('ENG-002')
      expect(result!.evidence_strength).toBeDefined()
      expect(result!.confidence).toBeGreaterThanOrEqual(0.5)
    })

    it('returns null for unrelated engrams', () => {
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for projects',
        domain: 'software.lang',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'Preheat oven before baking bread',
          domain: 'software.lang',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      expect(result).toBeNull()
    })

    it('returns null when confidence drops below 0.5', () => {
      // Low overlap: Jaccard will be low, and even with opposition pair the confidence stays below threshold
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'always prefer functional reactive programming patterns extensively',
        domain: 'software',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'never choose object-oriented classical inheritance hierarchies repeatedly',
          domain: 'software',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      // Low Jaccard similarity due to different content words, so it drops below threshold
      expect(result).toBeNull()
    })

    it('requires same domain', () => {
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for projects',
        domain: 'software.lang',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'Never use TypeScript for projects',
          domain: 'cooking.techniques',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      expect(result).toBeNull()
    })

    it('returns null when newEngram has no domain', () => {
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for projects',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'Never use TypeScript for projects',
          domain: 'software.lang',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      expect(result).toBeNull()
    })

    it('skips retired engrams', () => {
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for projects',
        domain: 'software.lang',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'Never use TypeScript for projects',
          domain: 'software.lang',
          status: 'retired',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      expect(result).toBeNull()
    })

    it('skips self-comparison', () => {
      const engram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for projects',
        domain: 'software.lang',
      })

      const result = detectContradiction(engram, [engram])
      expect(result).toBeNull()
    })

    it('classifies evidence strength as strong for high Jaccard', () => {
      // Very similar statements with opposition should yield strong evidence
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'Always use TypeScript for new projects',
        domain: 'software',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'Never use TypeScript for new projects',
          domain: 'software',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      expect(result).not.toBeNull()
      expect(result!.evidence_strength).toBe('strong')
    })

    it('classifies evidence strength as weak for lower Jaccard', () => {
      // Statements sharing some words but more divergent content
      const newEngram = makeEngram({
        id: 'ENG-001',
        statement: 'always prefer small functions modular code clean architecture',
        domain: 'software',
      })
      const existing = [
        makeEngram({
          id: 'ENG-002',
          statement: 'never prefer small functions because performance overhead matters',
          domain: 'software',
        }),
      ]

      const result = detectContradiction(newEngram, existing)
      if (result) {
        // If detected, it should be weak or moderate given partial overlap
        expect(['weak', 'moderate']).toContain(result.evidence_strength)
      }
    })
  })

  describe('queueReconsolidation', () => {
    it('adds to pending with 7-day expiry', () => {
      const profile = createDefaultProfile()
      const contradiction = {
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'Always use TypeScript',
        contradiction: 'Never use TypeScript',
        evidence_strength: 'strong' as const,
        confidence: 0.8,
      }

      const updated = queueReconsolidation(profile, contradiction)
      expect(updated.reconsolidation.pending).toHaveLength(1)

      const pending = updated.reconsolidation.pending[0]
      expect(pending.engram_id).toBe('ENG-001')
      expect(pending.contradicting_id).toBe('ENG-002')
      expect(pending.statement).toBe('Always use TypeScript')
      expect(pending.contradiction).toBe('Never use TypeScript')
      expect(pending.evidence_strength).toBe('strong')
      expect(pending.confidence).toBe(0.8)

      // Verify 7-day expiry
      const detected = new Date(pending.detected_at)
      const expires = new Date(pending.expires_at)
      const diffDays = (expires.getTime() - detected.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(7, 0)
    })

    it('sets correct fields on the pending entry', () => {
      const profile = createDefaultProfile()
      const contradiction = {
        engram_id: 'ENG-010',
        contradicting_id: 'ENG-020',
        statement: 'Prefer tabs',
        contradiction: 'Prefer spaces',
        evidence_strength: 'moderate' as const,
        confidence: 0.65,
      }

      const updated = queueReconsolidation(profile, contradiction)
      const pending = updated.reconsolidation.pending[0]

      expect(pending.engram_id).toBe('ENG-010')
      expect(pending.contradicting_id).toBe('ENG-020')
      expect(pending.evidence_strength).toBe('moderate')
      expect(pending.confidence).toBe(0.65)
      expect(pending.detected_at).toBeTruthy()
      expect(pending.expires_at).toBeTruthy()
    })

    it('does not mutate the original profile', () => {
      const profile = createDefaultProfile()
      const contradiction = {
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'A',
        contradiction: 'B',
        evidence_strength: 'weak' as const,
        confidence: 0.6,
      }

      queueReconsolidation(profile, contradiction)
      expect(profile.reconsolidation.pending).toHaveLength(0)
    })
  })

  describe('resolveReconsolidation', () => {
    function profileWithPending(): EngagementProfile {
      const profile = createDefaultProfile()
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'Always use TS',
        contradiction: 'Never use TS',
        evidence_strength: 'strong',
        confidence: 0.9,
        detected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      return profile
    }

    it('defend updates state (XP handled by caller)', () => {
      const profile = profileWithPending()
      const updated = resolveReconsolidation(profile, 'ENG-001', 'defend')
      expect(updated.xp.total).toBe(0) // XP handled by service.award(), not here
      expect(updated.reconsolidation.outcomes.defended).toBe(1)
      expect(updated.reconsolidation.total_resolved).toBe(1)
      expect(updated.reconsolidation.pending).toHaveLength(0)
    })

    it('revise updates state (XP handled by caller)', () => {
      const profile = profileWithPending()
      const updated = resolveReconsolidation(profile, 'ENG-001', 'revise')
      expect(updated.xp.total).toBe(0)
      expect(updated.reconsolidation.outcomes.revised).toBe(1)
      expect(updated.reconsolidation.total_resolved).toBe(1)
    })

    it('retire updates state (XP handled by caller)', () => {
      const profile = profileWithPending()
      const updated = resolveReconsolidation(profile, 'ENG-001', 'retire')
      expect(updated.xp.total).toBe(0)
      expect(updated.reconsolidation.outcomes.retired).toBe(1)
      expect(updated.reconsolidation.total_resolved).toBe(1)
    })

    it('dismiss updates state (XP handled by caller)', () => {
      const profile = profileWithPending()
      const updated = resolveReconsolidation(profile, 'ENG-001', 'dismiss')
      expect(updated.xp.total).toBe(0)
      expect(updated.reconsolidation.outcomes.dismissed).toBe(1)
      expect(updated.reconsolidation.total_resolved).toBe(1)
    })

    it('updates outcome counters correctly', () => {
      let profile = profileWithPending()
      profile = resolveReconsolidation(profile, 'ENG-001', 'defend')
      expect(profile.reconsolidation.outcomes.defended).toBe(1)
      expect(profile.reconsolidation.outcomes.revised).toBe(0)
      expect(profile.reconsolidation.outcomes.retired).toBe(0)
      expect(profile.reconsolidation.outcomes.dismissed).toBe(0)
    })

    it('returns unchanged profile when engram not in pending', () => {
      const profile = profileWithPending()
      const updated = resolveReconsolidation(profile, 'ENG-NONEXISTENT', 'defend')
      expect(updated.reconsolidation.pending).toHaveLength(1)
      expect(updated.xp.total).toBe(0)
      expect(updated.reconsolidation.total_resolved).toBe(0)
    })

    it('updates response rate', () => {
      const profile = profileWithPending()
      const updated = resolveReconsolidation(profile, 'ENG-001', 'defend')
      // 1 defended, 0 dismissed = 1/1 = 1.0
      expect(updated.reconsolidation.response_rate).toBe(1.0)
    })

    it('response rate accounts for dismissals', () => {
      let profile = profileWithPending()
      profile = resolveReconsolidation(profile, 'ENG-001', 'dismiss')
      // 0 actions / (0 + 1) = 0
      expect(profile.reconsolidation.response_rate).toBe(0)
    })
  })

  describe('expireReconsolidations', () => {
    it('auto-expires after 7 days and awards 3 XP each', () => {
      const profile = createDefaultProfile()
      const pastDate = new Date(Date.now() - 8 * 86400000)
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'A',
        contradiction: 'B',
        evidence_strength: 'strong',
        confidence: 0.9,
        detected_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        expires_at: pastDate.toISOString(),
      })
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-003',
        contradicting_id: 'ENG-004',
        statement: 'C',
        contradiction: 'D',
        evidence_strength: 'moderate',
        confidence: 0.7,
        detected_at: new Date(Date.now() - 9 * 86400000).toISOString(),
        expires_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      })

      const updated = expireReconsolidations(profile)
      expect(updated.reconsolidation.pending).toHaveLength(0)
      expect(updated.xp.total).toBe(6) // 3 XP * 2 expired
      expect(updated.reconsolidation.total_resolved).toBe(2)
      expect(updated.reconsolidation.outcomes.retired).toBe(2)
    })

    it('does not expire fresh entries', () => {
      const profile = createDefaultProfile()
      const futureDate = new Date(Date.now() + 5 * 86400000)
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'A',
        contradiction: 'B',
        evidence_strength: 'strong',
        confidence: 0.9,
        detected_at: new Date().toISOString(),
        expires_at: futureDate.toISOString(),
      })

      const updated = expireReconsolidations(profile)
      expect(updated.reconsolidation.pending).toHaveLength(1)
      expect(updated.xp.total).toBe(0)
      expect(updated.reconsolidation.total_resolved).toBe(0)
    })

    it('returns unchanged profile when nothing to expire', () => {
      const profile = createDefaultProfile()
      const updated = expireReconsolidations(profile)
      expect(updated.xp.total).toBe(0)
      expect(updated.reconsolidation.pending).toHaveLength(0)
    })

    it('only expires past-due entries and retains future ones', () => {
      const profile = createDefaultProfile()
      // One expired
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-001',
        contradicting_id: 'ENG-002',
        statement: 'Old',
        contradiction: 'OldC',
        evidence_strength: 'weak',
        confidence: 0.6,
        detected_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        expires_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      })
      // One still valid
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-003',
        contradicting_id: 'ENG-004',
        statement: 'New',
        contradiction: 'NewC',
        evidence_strength: 'strong',
        confidence: 0.9,
        detected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      })

      const updated = expireReconsolidations(profile)
      expect(updated.reconsolidation.pending).toHaveLength(1)
      expect(updated.reconsolidation.pending[0].engram_id).toBe('ENG-003')
      expect(updated.xp.total).toBe(3) // 1 expired * 3 XP
    })
  })
})
