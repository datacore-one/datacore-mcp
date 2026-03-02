// test/engagement/discovery.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import {
  generateDiscoveryCandidates,
  evaluateDiscovery,
  offerDiscovery,
  resolveDiscovery,
} from '../../src/engagement/discovery.js'
import type { DiscoveryCandidate, EvaluatedDiscovery } from '../../src/engagement/discovery.js'
import type { Engram } from '../../src/schemas/engram.js'

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

function makeEngramsInDomains(
  domains: string[],
  countPerDomain: number,
  sharedKeyword?: string,
): Engram[] {
  const engrams: Engram[] = []
  let idx = 0
  for (const domain of domains) {
    for (let i = 0; i < countPerDomain; i++) {
      idx++
      const extra = sharedKeyword ? ` ${sharedKeyword}` : ''
      engrams.push(
        makeEngram({
          id: `ENG-${String(idx).padStart(3, '0')}`,
          statement: `concept${idx} pattern${idx} approach${idx} methodology${idx}${extra}`,
          domain,
        }),
      )
    }
  }
  return engrams
}

describe('engagement/discovery', () => {
  const tmpDir = path.join(os.tmpdir(), 'discovery-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(tmpDir, { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('generateDiscoveryCandidates', () => {
    it('returns empty below 20 engrams', () => {
      const profile = createDefaultProfile()
      const engrams = makeEngramsInDomains(['a', 'b', 'c'], 6) // 18 total
      const result = generateDiscoveryCandidates(engrams, profile)
      expect(result).toHaveLength(0)
    })

    it('returns empty below 3 domains', () => {
      const profile = createDefaultProfile()
      const engrams = makeEngramsInDomains(['a', 'b'], 11) // 22 total, 2 domains
      const result = generateDiscoveryCandidates(engrams, profile)
      expect(result).toHaveLength(0)
    })

    it('respects 2-day cooldown', () => {
      const profile = createDefaultProfile()
      // Set last_offered to now (within 2-day cooldown)
      profile.discoveries.last_offered = new Date().toISOString()

      // Use shared keyword to ensure cross-domain overlap
      const engrams = makeEngramsInDomains(['a', 'b', 'c'], 7, 'testing') // 21 total
      const result = generateDiscoveryCandidates(engrams, profile)
      expect(result).toHaveLength(0)
    })

    it('finds cross-domain pairs with keyword overlap', () => {
      const profile = createDefaultProfile()
      // Create engrams across 3 domains with shared keywords
      const engrams: Engram[] = []
      // Domain A
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-A${i}`,
          statement: `architecture patterns modular design system component${i}`,
          domain: 'software',
        }))
      }
      // Domain B - shares some keywords with A
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-B${i}`,
          statement: `architecture patterns organizational design structure element${i}`,
          domain: 'business',
        }))
      }
      // Domain C
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-C${i}`,
          statement: `cooking recipes meal preparation technique${i}`,
          domain: 'cooking',
        }))
      }

      const result = generateDiscoveryCandidates(engrams, profile)
      // Should find pairs between software and business (shared: architecture, patterns, design)
      expect(result.length).toBeGreaterThan(0)

      // All pairs should be cross-domain
      for (const candidate of result) {
        expect(candidate.engram_a.domain).not.toBe(candidate.engram_b.domain)
      }
    })

    it('ranks by intersection size (descending)', () => {
      const profile = createDefaultProfile()
      const engrams: Engram[] = []

      // Domain A
      for (let i = 0; i < 8; i++) {
        engrams.push(makeEngram({
          id: `ENG-A${i}`,
          statement: `alpha beta gamma delta epsilon zeta word${i}`,
          domain: 'domainA',
        }))
      }
      // Domain B - high overlap with A
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-B${i}`,
          statement: `alpha beta gamma delta epsilon zeta term${i}`,
          domain: 'domainB',
        }))
      }
      // Domain C - low overlap with A/B
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-C${i}`,
          statement: `theta iota kappa lambda mu nu item${i}`,
          domain: 'domainC',
        }))
      }

      const result = generateDiscoveryCandidates(engrams, profile)
      if (result.length >= 2) {
        // First result should have >= overlap than the second
        expect(result[0].overlap_size).toBeGreaterThanOrEqual(result[1].overlap_size)
      }
    })

    it('returns candidates when cooldown has passed', () => {
      const profile = createDefaultProfile()
      // Set last_offered to 3 days ago (past 2-day cooldown)
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000)
      profile.discoveries.last_offered = threeDaysAgo.toISOString()

      // Use shared keyword to ensure cross-domain overlap
      const engrams: Engram[] = []
      for (let i = 0; i < 8; i++) {
        engrams.push(makeEngram({
          id: `ENG-A${i}`,
          statement: `testing patterns methodology approach concept${i}`,
          domain: 'alpha',
        }))
      }
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-B${i}`,
          statement: `testing patterns framework implementation idea${i}`,
          domain: 'beta',
        }))
      }
      for (let i = 0; i < 7; i++) {
        engrams.push(makeEngram({
          id: `ENG-C${i}`,
          statement: `testing patterns strategy optimization topic${i}`,
          domain: 'gamma',
        }))
      }

      const result = generateDiscoveryCandidates(engrams, profile)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('evaluateDiscovery', () => {
    const candidate: DiscoveryCandidate = {
      engram_a: { id: 'ENG-001', domain: 'software', statement: 'Modular architecture patterns' },
      engram_b: { id: 'ENG-002', domain: 'business', statement: 'Organizational design patterns' },
      overlap_size: 2,
    }

    it('returns null for "none" response', async () => {
      const llmCall = async (_prompt: string) => 'none'
      const result = await evaluateDiscovery(candidate, llmCall)
      expect(result).toBeNull()
    })

    it('returns EvaluatedDiscovery for valid response', async () => {
      const llmCall = async (_prompt: string) => 'Both use modular decomposition to manage complexity.'
      const result = await evaluateDiscovery(candidate, llmCall)
      expect(result).not.toBeNull()
      expect(result!.engram_a.id).toBe('ENG-001')
      expect(result!.engram_b.id).toBe('ENG-002')
      expect(result!.connection).toBe('Both use modular decomposition to manage complexity.')
    })

    it('returns null for empty response', async () => {
      const llmCall = async (_prompt: string) => ''
      const result = await evaluateDiscovery(candidate, llmCall)
      expect(result).toBeNull()
    })

    it('returns null on timeout', async () => {
      const llmCall = async (_prompt: string) => {
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve('late response'), 10000)
        })
      }
      const result = await evaluateDiscovery(candidate, llmCall)
      expect(result).toBeNull()
    }, 10000)

    it('returns null on LLM error', async () => {
      const llmCall = async (_prompt: string): Promise<string> => {
        throw new Error('LLM service unavailable')
      }
      const result = await evaluateDiscovery(candidate, llmCall)
      expect(result).toBeNull()
    })

    it('trims response whitespace', async () => {
      const llmCall = async (_prompt: string) => '  Connection found between concepts.  '
      const result = await evaluateDiscovery(candidate, llmCall)
      expect(result).not.toBeNull()
      expect(result!.connection).toBe('Connection found between concepts.')
    })
  })

  describe('offerDiscovery', () => {
    it('adds to pending discoveries', () => {
      const profile = createDefaultProfile()
      const discovery: EvaluatedDiscovery = {
        engram_a: { id: 'ENG-001', domain: 'software', statement: 'Modular patterns' },
        engram_b: { id: 'ENG-002', domain: 'business', statement: 'Org patterns' },
        connection: 'Both use decomposition.',
      }

      const updated = offerDiscovery(profile, discovery)
      expect(updated.discoveries.pending).toHaveLength(1)
      expect(updated.discoveries.total).toBe(1)
      expect(updated.discoveries.last_offered).toBeTruthy()

      const pending = updated.discoveries.pending[0]
      expect(pending.engram_a.id).toBe('ENG-001')
      expect(pending.engram_b.id).toBe('ENG-002')
      expect(pending.connection).toBe('Both use decomposition.')
      expect(pending.id).toMatch(/^disc-/)
      expect(pending.offered_at).toBeTruthy()
    })

    it('does not mutate original profile', () => {
      const profile = createDefaultProfile()
      const discovery: EvaluatedDiscovery = {
        engram_a: { id: 'ENG-001', domain: 'sw', statement: 'A' },
        engram_b: { id: 'ENG-002', domain: 'biz', statement: 'B' },
        connection: 'C',
      }

      offerDiscovery(profile, discovery)
      expect(profile.discoveries.pending).toHaveLength(0)
      expect(profile.discoveries.total).toBe(0)
    })
  })

  describe('resolveDiscovery', () => {
    function profileWithDiscovery(): { profile: ReturnType<typeof createDefaultProfile>; discoveryId: string } {
      const profile = createDefaultProfile()
      const id = 'disc-test-001'
      profile.discoveries.pending.push({
        id,
        engram_a: { id: 'ENG-001', domain: 'sw', statement: 'A' },
        engram_b: { id: 'ENG-002', domain: 'biz', statement: 'B' },
        connection: 'Both decompose.',
        offered_at: new Date().toISOString(),
      })
      profile.discoveries.total = 1
      return { profile, discoveryId: id }
    }

    it('explore updates state (XP handled by caller)', () => {
      const { profile, discoveryId } = profileWithDiscovery()
      const updated = resolveDiscovery(profile, discoveryId, 'explore')
      expect(updated.xp.total).toBe(0) // XP handled by service.award(), not here
      expect(updated.discoveries.explored).toBe(1)
      expect(updated.discoveries.pending).toHaveLength(0)
    })

    it('note updates state (XP handled by caller)', () => {
      const { profile, discoveryId } = profileWithDiscovery()
      const updated = resolveDiscovery(profile, discoveryId, 'note')
      expect(updated.xp.total).toBe(0)
      expect(updated.discoveries.noted).toBe(1)
      expect(updated.discoveries.pending).toHaveLength(0)
    })

    it('updates explore rate', () => {
      const { profile, discoveryId } = profileWithDiscovery()
      const updated = resolveDiscovery(profile, discoveryId, 'explore')
      // 1 explored / (1 explored + 0 noted) = 1.0
      expect(updated.discoveries.explore_rate).toBe(1.0)
    })

    it('explore rate reflects mixed actions', () => {
      const { profile, discoveryId } = profileWithDiscovery()
      // Pre-set some prior history
      profile.discoveries.explored = 2
      profile.discoveries.noted = 1

      const updated = resolveDiscovery(profile, discoveryId, 'note')
      // 2 explored / (2 explored + 2 noted) = 0.5
      expect(updated.discoveries.explore_rate).toBe(0.5)
    })

    it('returns unchanged profile for unknown discovery ID', () => {
      const { profile } = profileWithDiscovery()
      const updated = resolveDiscovery(profile, 'disc-nonexistent', 'explore')
      expect(updated.discoveries.pending).toHaveLength(1)
      expect(updated.xp.total).toBe(0)
    })
  })
})
