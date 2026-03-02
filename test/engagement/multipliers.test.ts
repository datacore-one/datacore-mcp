// test/engagement/multipliers.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { evaluateMultipliers } from '../../src/engagement/multipliers.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import type { EngagementProfile } from '../../src/engagement/types.js'

describe('engagement/multipliers', () => {
  const tmpDir = path.join(os.tmpdir(), 'engagement-multipliers-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('evaluateMultipliers', () => {
    it('returns empty array for default profile (no multipliers qualify)', () => {
      const profile = createDefaultProfile()
      const result = evaluateMultipliers(profile)
      expect(result).toEqual([])
    })

    it('returns verified multiplier (1.5x) when erc8004_registered', () => {
      const profile = createDefaultProfile()
      profile.identity.erc8004_registered = true

      const result = evaluateMultipliers(profile)
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verified')
      expect(result[0].factor).toBe(1.5)
    })

    it('does not return verified multiplier when erc8004_registered is false', () => {
      const profile = createDefaultProfile()
      profile.identity.erc8004_registered = false

      const result = evaluateMultipliers(profile)
      const verifiedMult = result.find(m => m.type === 'verified')
      expect(verifiedMult).toBeUndefined()
    })

    describe('top_teacher multiplier (1.25x)', () => {
      function teacherProfile(): EngagementProfile {
        const p = createDefaultProfile()
        p.stats.total_packs_exported = 3
        p.stats.total_feedback_received = 20
        p.stats.feedback_positive_ratio = 0.85
        return p
      }

      it('qualifies when all thresholds met', () => {
        const result = evaluateMultipliers(teacherProfile())
        const teacher = result.find(m => m.type === 'top_teacher')
        expect(teacher).toBeDefined()
        expect(teacher!.factor).toBe(1.25)
      })

      it('does not qualify with only 2 packs exported', () => {
        const p = teacherProfile()
        p.stats.total_packs_exported = 2
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_teacher')).toBeUndefined()
      })

      it('does not qualify with only 19 feedback received', () => {
        const p = teacherProfile()
        p.stats.total_feedback_received = 19
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_teacher')).toBeUndefined()
      })

      it('does not qualify with positive ratio below 0.85', () => {
        const p = teacherProfile()
        p.stats.feedback_positive_ratio = 0.84
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_teacher')).toBeUndefined()
      })
    })

    describe('top_learner multiplier (1.25x)', () => {
      function learnerProfile(): EngagementProfile {
        const p = createDefaultProfile()
        p.reconsolidation.total_resolved = 5
        p.discoveries.total = 3
        p.reconsolidation.response_rate = 0.8
        p.discoveries.explore_rate = 0.5
        return p
      }

      it('qualifies when all thresholds met', () => {
        const result = evaluateMultipliers(learnerProfile())
        const learner = result.find(m => m.type === 'top_learner')
        expect(learner).toBeDefined()
        expect(learner!.factor).toBe(1.25)
      })

      it('does not qualify with only 4 reconsolidations resolved', () => {
        const p = learnerProfile()
        p.reconsolidation.total_resolved = 4
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_learner')).toBeUndefined()
      })

      it('does not qualify with only 2 discoveries', () => {
        const p = learnerProfile()
        p.discoveries.total = 2
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_learner')).toBeUndefined()
      })

      it('does not qualify with response_rate below 0.8', () => {
        const p = learnerProfile()
        p.reconsolidation.response_rate = 0.79
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_learner')).toBeUndefined()
      })

      it('does not qualify with explore_rate below 0.5', () => {
        const p = learnerProfile()
        p.discoveries.explore_rate = 0.49
        const result = evaluateMultipliers(p)
        expect(result.find(m => m.type === 'top_learner')).toBeUndefined()
      })
    })

    describe('stacking', () => {
      it('stacks all three multipliers: verified + teacher + learner', () => {
        const profile = createDefaultProfile()
        // Verified
        profile.identity.erc8004_registered = true
        // Top Teacher
        profile.stats.total_packs_exported = 3
        profile.stats.total_feedback_received = 20
        profile.stats.feedback_positive_ratio = 0.85
        // Top Learner
        profile.reconsolidation.total_resolved = 5
        profile.discoveries.total = 3
        profile.reconsolidation.response_rate = 0.8
        profile.discoveries.explore_rate = 0.5

        const result = evaluateMultipliers(profile)
        expect(result).toHaveLength(3)

        const types = result.map(m => m.type)
        expect(types).toContain('verified')
        expect(types).toContain('top_teacher')
        expect(types).toContain('top_learner')

        // Effective multiplier: 1.5 * 1.25 * 1.25 = 2.34375
        let effective = 1.0
        for (const m of result) {
          effective *= m.factor
        }
        expect(effective).toBeCloseTo(2.34375)
      })

      it('stacks verified + teacher only', () => {
        const profile = createDefaultProfile()
        profile.identity.erc8004_registered = true
        profile.stats.total_packs_exported = 3
        profile.stats.total_feedback_received = 20
        profile.stats.feedback_positive_ratio = 0.85

        const result = evaluateMultipliers(profile)
        expect(result).toHaveLength(2)

        let effective = 1.0
        for (const m of result) {
          effective *= m.factor
        }
        // 1.5 * 1.25 = 1.875
        expect(effective).toBeCloseTo(1.875)
      })
    })

    describe('deactivation', () => {
      it('drops verified multiplier when erc8004_registered becomes false', () => {
        const profile = createDefaultProfile()
        profile.identity.erc8004_registered = true

        // First check — should have verified
        const before = evaluateMultipliers(profile)
        expect(before.find(m => m.type === 'verified')).toBeDefined()

        // Deactivate
        profile.identity.erc8004_registered = false
        const after = evaluateMultipliers(profile)
        expect(after.find(m => m.type === 'verified')).toBeUndefined()
      })

      it('drops top_teacher when packs exported drops below threshold', () => {
        const profile = createDefaultProfile()
        profile.stats.total_packs_exported = 3
        profile.stats.total_feedback_received = 20
        profile.stats.feedback_positive_ratio = 0.85

        const before = evaluateMultipliers(profile)
        expect(before.find(m => m.type === 'top_teacher')).toBeDefined()

        // Simulate pack count dropping (edge case — stats changed)
        profile.stats.total_packs_exported = 2
        const after = evaluateMultipliers(profile)
        expect(after.find(m => m.type === 'top_teacher')).toBeUndefined()
      })
    })
  })
})
