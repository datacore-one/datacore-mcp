// test/tools/resolve.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/service.js'
import { handleResolve } from '../../src/tools/resolve.js'
import type { EngagementConfig } from '../../src/engagement/types.js'

const ENGRAM_YAML = `engrams:
  - id: ENG-2026-0301-001
    version: 1
    status: active
    type: behavioral
    scope: global
    visibility: private
    statement: "Always use TypeScript"
    domain: software.lang
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-03-01"
    tags: []
    pack: null
    abstract: null
    derived_from: null
    consolidated: false
    derivation_count: 1
  - id: ENG-2026-0301-002
    version: 1
    status: active
    type: behavioral
    scope: global
    visibility: private
    statement: "Never use TypeScript"
    domain: software.lang
    activation:
      retrieval_strength: 0.7
      storage_strength: 0.5
      frequency: 1
      last_accessed: "2026-03-01"
    tags: []
    pack: null
    abstract: null
    derived_from: null
    consolidated: false
    derivation_count: 1
`

describe('tools/resolve', () => {
  const tmpDir = path.join(os.tmpdir(), 'resolve-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const enabledConfig: EngagementConfig = { enabled: true, inline_xp: false }
  const disabledConfig: EngagementConfig = { enabled: false, inline_xp: false }

  let service: EngagementService

  beforeEach(async () => {
    resetConfigCache()
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'engagement'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'learning'), { recursive: true })
    fs.writeFileSync(engramsPath, ENGRAM_YAML)
    fs.writeFileSync(
      path.join(tmpDir, '.datacore', 'learning', 'engrams.yaml'),
      yaml.dump({ engrams: [] }),
    )
    loadConfig(tmpDir, 'core')

    service = new EngagementService(tmpDir, enabledConfig)
    await service.init()
    service.markSessionActive()
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('error cases', () => {
    it('returns error when engagement disabled', async () => {
      const disabledService = new EngagementService(tmpDir, disabledConfig)
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-001', action: 'defend' },
        engramsPath,
        disabledService,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('disabled')
    })

    it('returns error for invalid type', async () => {
      const result = await handleResolve(
        { type: 'invalid_type' as any, id: 'ENG-001', action: 'defend' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown resolve type')
    })

    it('returns error when no engagement profile loaded', async () => {
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-001', action: 'defend' },
        engramsPath,
        undefined,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('disabled')
    })
  })

  describe('reconsolidation', () => {
    function addPendingRecon(svc: EngagementService) {
      const profile = svc.getProfile()!
      profile.reconsolidation.pending.push({
        engram_id: 'ENG-2026-0301-001',
        contradicting_id: 'ENG-2026-0301-002',
        statement: 'Always use TypeScript',
        contradiction: 'Never use TypeScript',
        evidence_strength: 'strong',
        confidence: 0.9,
        detected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
    }

    it('defend returns success with XP', async () => {
      addPendingRecon(service)
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-2026-0301-001', action: 'defend' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.type).toBe('reconsolidation')
      expect(result.action).toBe('defend')
      expect(result.message).toContain('defended')
    })

    it('revise returns success and requires revised_statement', async () => {
      addPendingRecon(service)
      // Without revised_statement
      const errorResult = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-2026-0301-001', action: 'revise' },
        engramsPath,
        service,
      )
      expect(errorResult.success).toBe(false)
      expect(errorResult.error).toContain('revised_statement')
    })

    it('revise with revised_statement succeeds', async () => {
      addPendingRecon(service)
      const result = await handleResolve(
        {
          type: 'reconsolidation',
          id: 'ENG-2026-0301-001',
          action: 'revise',
          revised_statement: 'Use TypeScript when appropriate',
        },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.message).toContain('revised')
    })

    it('retire returns success', async () => {
      addPendingRecon(service)
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-2026-0301-001', action: 'retire' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.message).toContain('retired')
    })

    it('dismiss returns success with 0 XP', async () => {
      addPendingRecon(service)
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-2026-0301-001', action: 'dismiss' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.action).toBe('dismiss')
      expect(result.message).toContain('dismissed')
    })

    it('returns error for unknown engram in pending', async () => {
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-NONEXISTENT', action: 'defend' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('No pending reconsolidation')
    })

    it('returns error for invalid reconsolidation action', async () => {
      addPendingRecon(service)
      const result = await handleResolve(
        { type: 'reconsolidation', id: 'ENG-2026-0301-001', action: 'invalid_action' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid action')
    })
  })

  describe('discovery', () => {
    function addPendingDiscovery(svc: EngagementService): string {
      const profile = svc.getProfile()!
      const id = 'disc-test-001'
      profile.discoveries.pending.push({
        id,
        engram_a: { id: 'ENG-A', domain: 'software', statement: 'Modular patterns' },
        engram_b: { id: 'ENG-B', domain: 'business', statement: 'Org patterns' },
        connection: 'Both use decomposition.',
        offered_at: new Date().toISOString(),
      })
      return id
    }

    it('explore returns success', async () => {
      const discId = addPendingDiscovery(service)
      const result = await handleResolve(
        { type: 'discovery', id: discId, action: 'explore' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.type).toBe('discovery')
      expect(result.action).toBe('explore')
      expect(result.message).toContain('explored')
    })

    it('note returns success', async () => {
      const discId = addPendingDiscovery(service)
      const result = await handleResolve(
        { type: 'discovery', id: discId, action: 'note' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.message).toContain('noted')
    })

    it('returns error for unknown discovery ID', async () => {
      const result = await handleResolve(
        { type: 'discovery', id: 'disc-nonexistent', action: 'explore' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('No pending discovery')
    })

    it('returns error for invalid discovery action', async () => {
      const discId = addPendingDiscovery(service)
      const result = await handleResolve(
        { type: 'discovery', id: discId, action: 'invalid' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid action')
    })
  })

  describe('challenge', () => {
    function addActiveChallenge(svc: EngagementService): string {
      const profile = svc.getProfile()!
      const id = 'chal-test-001'
      profile.challenges.active = {
        id,
        type: 'first_steps',
        tier: 'Seed',
        description: 'Create engrams',
        criteria: { metric: 'total_engrams_created', target_delta: 5 },
        baseline_stats: { total_engrams_created: 0 },
        bonus_xp: 15,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }
      return id
    }

    it('dismiss returns success with 0 XP', async () => {
      const chalId = addActiveChallenge(service)
      const result = await handleResolve(
        { type: 'challenge', id: chalId, action: 'dismiss' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(true)
      expect(result.type).toBe('challenge')
      expect(result.action).toBe('dismiss')
      expect(result.xp_earned).toBe(0)
      expect(result.message).toContain('dismissed')
    })

    it('rejects invalid actions', async () => {
      const chalId = addActiveChallenge(service)
      const result = await handleResolve(
        { type: 'challenge', id: chalId, action: 'defend' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid action')
    })

    it('rejects complete when criteria not met', async () => {
      const chalId = addActiveChallenge(service)
      const result = await handleResolve(
        { type: 'challenge', id: chalId, action: 'complete' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('criteria not yet met')
    })

    it('returns error for unknown challenge ID', async () => {
      addActiveChallenge(service)
      const result = await handleResolve(
        { type: 'challenge', id: 'chal-nonexistent', action: 'dismiss' },
        engramsPath,
        service,
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('No active challenge')
    })
  })
})
