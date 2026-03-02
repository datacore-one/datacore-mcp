// test/engagement/service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { EngagementService } from '../../src/engagement/service.js'
import type { EngagementConfig } from '../../src/engagement/types.js'

describe('EngagementService', () => {
  const tmpDir = path.join(os.tmpdir(), 'engagement-service-test-' + Date.now())

  const enabledConfig: EngagementConfig = { enabled: true, inline_xp: false }
  const disabledConfig: EngagementConfig = { enabled: false, inline_xp: false }

  beforeEach(() => {
    resetConfigCache()
    // Create full .datacore structure
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'engagement'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'learning'), { recursive: true })
    // Create a minimal engrams.yaml so migration can potentially run
    fs.writeFileSync(
      path.join(tmpDir, '.datacore', 'learning', 'engrams.yaml'),
      yaml.dump({ engrams: [] }),
    )
    loadConfig(tmpDir, 'core')
  })

  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('lifecycle: init -> award -> flush', () => {
    it('initializes with empty profile, awards XP, and persists on flush', async () => {
      const service = new EngagementService(tmpDir, enabledConfig)
      expect(service.isEnabled()).toBe(true)

      await service.init()
      const profile = service.getProfile()
      expect(profile).not.toBeNull()
      expect(profile!.version).toBe(4)
      expect(profile!.xp.total).toBe(0)

      // Mark session active to prevent auto-flush
      service.markSessionActive()

      // Award XP
      const result = await service.award('engram_created')
      expect(result).not.toBeNull()
      expect(result!.event.xp_earned).toBe(10)
      expect(result!.event.action_key).toBe('engram_created')

      // Profile should be updated in memory
      const updatedProfile = service.getProfile()
      expect(updatedProfile!.xp.total).toBe(10)

      // Flush to disk
      await service.flush()

      // Verify file was written
      const profilePath = path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml')
      expect(fs.existsSync(profilePath)).toBe(true)
      const saved = yaml.load(fs.readFileSync(profilePath, 'utf8')) as any
      expect(saved.xp.total).toBe(10)
    })

    it('accumulates multiple awards in a session', async () => {
      const service = new EngagementService(tmpDir, enabledConfig)
      await service.init()
      service.markSessionActive()

      await service.award('engram_created')
      await service.award('feedback_given')
      await service.award('engram_promoted')

      const profile = service.getProfile()
      // 10 + 5 + 3 = 18
      expect(profile!.xp.total).toBe(18)

      const summary = service.getSessionSummary()
      expect(summary.total_xp).toBe(18)
      expect(summary.events).toHaveLength(3)
      expect(summary.actions['engram_created']).toBe(1)
      expect(summary.actions['feedback_given']).toBe(1)
      expect(summary.actions['engram_promoted']).toBe(1)
    })
  })

  describe('disabled mode', () => {
    it('returns null for all operations when disabled', async () => {
      const service = new EngagementService(tmpDir, disabledConfig)
      expect(service.isEnabled()).toBe(false)

      await service.init()
      expect(service.getProfile()).toBeNull()

      const result = await service.award('engram_created')
      expect(result).toBeNull()

      // Flush should not write anything
      await service.flush()
      const profilePath = path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml')
      expect(fs.existsSync(profilePath)).toBe(false)
    })
  })

  describe('non-session auto-flush', () => {
    it('auto-flushes when session is not active', async () => {
      const service = new EngagementService(tmpDir, enabledConfig)
      await service.init()
      // Do NOT call markSessionActive — session is not active

      await service.award('engram_created')

      // Profile should already be persisted due to auto-flush
      const profilePath = path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml')
      expect(fs.existsSync(profilePath)).toBe(true)
      const saved = yaml.load(fs.readFileSync(profilePath, 'utf8')) as any
      expect(saved.xp.total).toBe(10)
    })

    it('does not auto-flush when session is active', async () => {
      const service = new EngagementService(tmpDir, enabledConfig)
      await service.init()
      service.markSessionActive()

      await service.award('engram_created')

      // Profile should NOT be persisted yet (session active, no flush)
      const profilePath = path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml')
      // The file might not exist if no prior save
      if (fs.existsSync(profilePath)) {
        const saved = yaml.load(fs.readFileSync(profilePath, 'utf8')) as any
        // If a file exists from init (migration), the total should still be 0
        expect(saved.xp.total).toBe(0)
      }
    })
  })

  describe('session lifecycle', () => {
    it('resets session events on markSessionActive', async () => {
      const service = new EngagementService(tmpDir, enabledConfig)
      await service.init()

      // Auto-flush mode: award once
      await service.award('engram_created')
      let summary = service.getSessionSummary()
      expect(summary.events).toHaveLength(1)

      // Start new session — should reset events
      service.markSessionActive()
      summary = service.getSessionSummary()
      expect(summary.events).toHaveLength(0)
      expect(summary.total_xp).toBe(0)
    })
  })

  describe('migration on first init', () => {
    it('migrates from existing engrams when no profile exists', async () => {
      // Write some engrams to the engrams file
      const engramsPath = path.join(tmpDir, '.datacore', 'learning', 'engrams.yaml')
      fs.writeFileSync(engramsPath, yaml.dump({
        engrams: [
          {
            id: 'ENG-2026-0301-001',
            version: 1,
            status: 'active',
            type: 'behavioral',
            scope: 'global',
            visibility: 'public',
            statement: 'Test engram 1',
            domain: 'software',
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
            consolidated: false,
            derivation_count: 1,
          },
          {
            id: 'ENG-2026-0301-002',
            version: 1,
            status: 'active',
            type: 'procedural',
            scope: 'global',
            visibility: 'private',
            statement: 'Test engram 2',
            domain: 'cooking',
            activation: {
              retrieval_strength: 0.6,
              storage_strength: 0.4,
              frequency: 1,
              last_accessed: '2026-03-01',
            },
            tags: [],
            pack: null,
            abstract: null,
            derived_from: null,
            consolidated: false,
            derivation_count: 1,
          },
        ],
      }))

      const service = new EngagementService(tmpDir, enabledConfig)
      await service.init()

      const profile = service.getProfile()
      expect(profile).not.toBeNull()
      // 2 active * 10 = 20
      // 1 public * 10 = 10
      // 0 feedback
      // 2 domains * 20 = 40
      // Total = 70
      expect(profile!.xp.total).toBe(70)
      expect(profile!.stats.total_engrams_created).toBe(2)
      expect(profile!.stats.domains_covered).toBe(2)
      expect(profile!.stats.public_engrams).toBe(1)
    })
  })

  describe('tier change detection', () => {
    it('detects tier change when XP crosses threshold', async () => {
      const service = new EngagementService(tmpDir, enabledConfig)
      await service.init()
      service.markSessionActive()

      // Set profile to just below Cipher threshold
      const profile = service.getProfile()!
      profile.xp.total = 95

      // Award 10 XP → total = 105 → should trigger Cipher
      const result = await service.award('engram_created')
      expect(result).not.toBeNull()
      expect(result!.tier_change).not.toBeNull()
      expect(result!.tier_change!.from).toBe('Seed')
      expect(result!.tier_change!.to).toBe('Cipher')
      expect(result!.tier_change!.message).toContain('Cipher')
    })
  })
})
