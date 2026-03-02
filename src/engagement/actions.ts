// src/engagement/actions.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { XPActionRegistrySchema, type XPActionRegistry } from './types.js'
import { logger } from '../logger.js'

export const BUNDLED_ACTIONS: XPActionRegistry = {
  version: 1,
  actions: {
    engram_created: {
      xp: 10,
      trigger: 'datacore.learn',
      condition: 'status === active',
      description: 'Create a quality engram',
    },
    engram_created_public: {
      xp: 20,
      trigger: 'datacore.learn',
      condition: 'visibility === public || visibility === template',
      description: 'Create a public/template engram',
    },
    feedback_given: {
      xp: 5,
      trigger: 'datacore.feedback',
      daily_limit: 10,
      description: 'Give feedback on an injected engram',
    },
    engram_promoted: {
      xp: 3,
      trigger: 'datacore.promote',
      description: 'Promote a candidate engram to active',
    },
    engram_retired: {
      xp: 5,
      trigger: 'datacore.forget',
      cooldown_days: 7,
      description: 'Retire an engram after reflection (7-day cooldown)',
    },
    pack_exported: {
      xp: 25,
      trigger: 'datacore.packs.export',
      condition: 'engram_count >= 5 && avg_fitness >= 0.6',
      description: 'Export a quality pack (5+ engrams, 0.6+ fitness)',
    },
    new_domain: {
      xp: 15,
      trigger: 'datacore.learn',
      description: 'Create first engram in a new domain',
    },
    reconsolidation_defend: {
      xp: 12,
      trigger: 'datacore.resolve',
      description: 'Defend an engram during contradiction challenge',
    },
    reconsolidation_revise: {
      xp: 10,
      trigger: 'datacore.resolve',
      description: 'Revise an engram during contradiction challenge',
    },
    reconsolidation_retire: {
      xp: 8,
      trigger: 'datacore.resolve',
      description: 'Retire an engram during contradiction challenge',
    },
    discovery_explore: {
      xp: 20,
      trigger: 'datacore.resolve',
      description: 'Explore a cross-domain discovery',
    },
    reconsolidation_expired: {
      xp: 3,
      trigger: 'system',
      description: 'Auto-expire an overdue reconsolidation',
    },
  },
}

export function loadActions(basePath: string): XPActionRegistry {
  const actionsPath = path.join(basePath, '.datacore', 'engagement', 'xp-actions.yaml')
  if (!fs.existsSync(actionsPath)) {
    return BUNDLED_ACTIONS
  }

  try {
    const raw = yaml.load(fs.readFileSync(actionsPath, 'utf8'))
    return XPActionRegistrySchema.parse(raw)
  } catch (err) {
    logger.warning(`Malformed xp-actions.yaml, using defaults: ${err}`)
    return BUNDLED_ACTIONS
  }
}

export function writeDefaultActions(basePath: string): void {
  const dir = path.join(basePath, '.datacore', 'engagement')
  const actionsPath = path.join(dir, 'xp-actions.yaml')
  if (fs.existsSync(actionsPath)) return

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const content = yaml.dump(BUNDLED_ACTIONS, { lineWidth: 120, noRefs: true, quotingType: '"' })
  fs.writeFileSync(actionsPath, content)
}
