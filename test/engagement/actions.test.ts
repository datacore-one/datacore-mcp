// test/engagement/actions.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig, resetConfigCache } from '../../src/config.js'
import { loadActions, BUNDLED_ACTIONS } from '../../src/engagement/actions.js'

describe('engagement/actions', () => {
  const tmpDir = path.join(os.tmpdir(), 'engagement-actions-test-' + Date.now())

  beforeEach(() => {
    resetConfigCache()
    fs.mkdirSync(path.join(tmpDir, '.datacore', 'engagement'), { recursive: true })
    loadConfig(tmpDir, 'core')
  })
  afterEach(() => {
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('BUNDLED_ACTIONS', () => {
    it('has version 1', () => {
      expect(BUNDLED_ACTIONS.version).toBe(1)
    })

    it('contains expected action keys', () => {
      const keys = Object.keys(BUNDLED_ACTIONS.actions)
      expect(keys).toContain('engram_created')
      expect(keys).toContain('engram_created_public')
      expect(keys).toContain('feedback_given')
      expect(keys).toContain('engram_promoted')
      expect(keys).toContain('engram_retired')
      expect(keys).toContain('pack_exported')
      expect(keys).toContain('new_domain')
    })

    it('engram_created awards 10 XP', () => {
      expect(BUNDLED_ACTIONS.actions.engram_created.xp).toBe(10)
    })

    it('feedback_given has daily_limit of 10', () => {
      expect(BUNDLED_ACTIONS.actions.feedback_given.daily_limit).toBe(10)
    })

    it('engram_retired has cooldown_days of 7', () => {
      expect(BUNDLED_ACTIONS.actions.engram_retired.cooldown_days).toBe(7)
    })
  })

  describe('loadActions', () => {
    it('returns BUNDLED_ACTIONS when no custom file exists', () => {
      const actions = loadActions(tmpDir)
      expect(actions).toEqual(BUNDLED_ACTIONS)
    })

    it('loads custom actions from xp-actions.yaml', () => {
      const custom = {
        version: 2,
        actions: {
          custom_action: {
            xp: 42,
            trigger: 'custom.trigger',
            description: 'A custom action',
          },
        },
      }
      const actionsPath = path.join(tmpDir, '.datacore', 'engagement', 'xp-actions.yaml')
      fs.writeFileSync(actionsPath, yaml.dump(custom))

      const actions = loadActions(tmpDir)
      expect(actions.version).toBe(2)
      expect(actions.actions.custom_action).toBeDefined()
      expect(actions.actions.custom_action.xp).toBe(42)
      // Bundled actions should NOT be present (custom file replaces them)
      expect(actions.actions.engram_created).toBeUndefined()
    })

    it('falls back to BUNDLED_ACTIONS for malformed YAML', () => {
      const actionsPath = path.join(tmpDir, '.datacore', 'engagement', 'xp-actions.yaml')
      fs.writeFileSync(actionsPath, '{{{{ not yaml }}}}')

      const actions = loadActions(tmpDir)
      expect(actions).toEqual(BUNDLED_ACTIONS)
    })

    it('falls back to BUNDLED_ACTIONS for schema-invalid file', () => {
      const actionsPath = path.join(tmpDir, '.datacore', 'engagement', 'xp-actions.yaml')
      // Valid YAML but missing required fields for XPActionRegistrySchema
      fs.writeFileSync(actionsPath, yaml.dump({
        version: 1,
        actions: {
          bad_action: { xp: 'not a number', trigger: 'test' },
        },
      }))

      const actions = loadActions(tmpDir)
      expect(actions).toEqual(BUNDLED_ACTIONS)
    })
  })
})
