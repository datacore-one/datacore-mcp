// test/engagement/profile.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import {
  loadProfile,
  saveProfile,
  createDefaultProfile,
  setPrivacyMode,
  generatePseudonym,
} from '../../src/engagement/profile.js'

describe('engagement/profile', () => {
  const tmpDir = path.join(os.tmpdir(), 'engagement-profile-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'engagement'), { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('createDefaultProfile', () => {
    it('returns a valid profile with all defaults', () => {
      const profile = createDefaultProfile()
      expect(profile.version).toBe(4)
      expect(profile.identity.mode).toBe('private')
      expect(profile.xp.total).toBe(0)
      expect(profile.tier.current).toBe('Seed')
      expect(profile.multipliers.effective).toBe(1.0)
      expect(profile.stats.total_engrams_created).toBe(0)
    })
  })

  describe('loadProfile', () => {
    it('returns defaults when no profile file exists', () => {
      const profile = loadProfile(tmpDir)
      expect(profile.version).toBe(4)
      expect(profile.xp.total).toBe(0)
      expect(profile.tier.current).toBe('Seed')
    })

    it('loads an existing profile from disk', () => {
      const profilePath = path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml')
      fs.writeFileSync(profilePath, [
        'version: 4',
        'identity:',
        '  mode: anonymous',
        '  pseudonym: cipher-abcd',
        '  erc8004_address: null',
        '  erc8004_registered: false',
        'xp:',
        '  total: 150',
        '  this_week: 20',
        '  history: []',
        'tier:',
        '  current: Cipher',
        '  achieved_at: "2026-02-15"',
        '  history:',
        '    - tier: Cipher',
        '      date: "2026-02-15"',
      ].join('\n'))

      const profile = loadProfile(tmpDir)
      expect(profile.xp.total).toBe(150)
      expect(profile.tier.current).toBe('Cipher')
      expect(profile.identity.mode).toBe('anonymous')
      expect(profile.identity.pseudonym).toBe('cipher-abcd')
    })

    it('returns defaults for corrupted profile and creates backup', () => {
      const profilePath = path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml')
      fs.writeFileSync(profilePath, '{{corrupt yaml}}')

      const profile = loadProfile(tmpDir)
      expect(profile.version).toBe(4)
      expect(profile.xp.total).toBe(0)
      // Backup file should exist
      expect(fs.existsSync(profilePath + '.bak')).toBe(true)
    })
  })

  describe('saveProfile + loadProfile roundtrip', () => {
    it('saves and reloads a profile accurately', () => {
      const original = createDefaultProfile()
      original.xp.total = 350
      original.tier.current = 'Cipher'
      original.identity.mode = 'anonymous'
      original.identity.pseudonym = 'cipher-1234'
      original.stats.total_engrams_created = 15
      original.stats.domains_covered = 3

      saveProfile(tmpDir, original)
      const reloaded = loadProfile(tmpDir)

      expect(reloaded.xp.total).toBe(350)
      expect(reloaded.tier.current).toBe('Cipher')
      expect(reloaded.identity.mode).toBe('anonymous')
      expect(reloaded.identity.pseudonym).toBe('cipher-1234')
      expect(reloaded.stats.total_engrams_created).toBe(15)
      expect(reloaded.stats.domains_covered).toBe(3)
    })

    it('creates engagement directory if missing', () => {
      // Remove the engagement dir we created in beforeEach
      fs.rmSync(path.join(tmpDir, '.datacore', 'engagement'), { recursive: true, force: true })

      const profile = createDefaultProfile()
      saveProfile(tmpDir, profile)

      expect(fs.existsSync(path.join(tmpDir, '.datacore', 'engagement', 'profile.yaml'))).toBe(true)
    })
  })

  describe('setPrivacyMode', () => {
    it('sets mode to private', () => {
      const profile = createDefaultProfile()
      const updated = setPrivacyMode(profile, 'private')
      expect(updated.identity.mode).toBe('private')
    })

    it('sets mode to anonymous and generates pseudonym', () => {
      const profile = createDefaultProfile()
      const updated = setPrivacyMode(profile, 'anonymous')
      expect(updated.identity.mode).toBe('anonymous')
      expect(updated.identity.pseudonym).toMatch(/^cipher-[0-9a-f]{4}$/)
    })

    it('keeps existing pseudonym when switching to anonymous', () => {
      const profile = createDefaultProfile()
      profile.identity.pseudonym = 'cipher-existing'
      const updated = setPrivacyMode(profile, 'anonymous')
      expect(updated.identity.pseudonym).toBe('cipher-existing')
    })

    it('throws when setting verified without erc8004_registered', () => {
      const profile = createDefaultProfile()
      expect(() => setPrivacyMode(profile, 'verified')).toThrow(
        'Verified mode requires erc8004_registered to be true',
      )
    })

    it('allows verified mode when erc8004_registered is true', () => {
      const profile = createDefaultProfile()
      profile.identity.erc8004_registered = true
      const updated = setPrivacyMode(profile, 'verified')
      expect(updated.identity.mode).toBe('verified')
    })

    it('does not mutate the original profile', () => {
      const profile = createDefaultProfile()
      setPrivacyMode(profile, 'anonymous')
      expect(profile.identity.mode).toBe('private')
      expect(profile.identity.pseudonym).toBeNull()
    })
  })

  describe('generatePseudonym', () => {
    it('returns string matching cipher-XXXX pattern', () => {
      const name = generatePseudonym()
      expect(name).toMatch(/^cipher-[0-9a-f]{4}$/)
    })

    it('generates different pseudonyms on repeated calls', () => {
      const names = new Set(Array.from({ length: 20 }, () => generatePseudonym()))
      // With 2 random bytes (65536 possibilities), 20 calls should be unique
      expect(names.size).toBeGreaterThan(1)
    })
  })
})
