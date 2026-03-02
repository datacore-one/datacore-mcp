// src/engagement/profile.ts
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as yaml from 'js-yaml'
import { EngagementProfileSchema, type EngagementProfile } from './types.js'
import { logger } from '../logger.js'

const PROFILE_DIR = 'engagement'
const PROFILE_FILE = 'profile.yaml'

function engagementDir(basePath: string): string {
  return path.join(basePath, '.datacore', PROFILE_DIR)
}

function profilePath(basePath: string): string {
  return path.join(engagementDir(basePath), PROFILE_FILE)
}

export function createDefaultProfile(): EngagementProfile {
  return EngagementProfileSchema.parse({ version: 4 })
}

export function loadProfile(basePath: string): EngagementProfile {
  const filePath = profilePath(basePath)
  if (!fs.existsSync(filePath)) {
    return createDefaultProfile()
  }

  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf8'))
    return EngagementProfileSchema.parse(raw)
  } catch (err) {
    logger.warning(`Engagement profile corrupted, backing up and creating fresh: ${err}`)
    try {
      fs.copyFileSync(filePath, filePath + '.bak')
    } catch { /* ignore backup failure */ }
    return createDefaultProfile()
  }
}

export function saveProfile(basePath: string, profile: EngagementProfile): void {
  const dir = engagementDir(basePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const filePath = profilePath(basePath)
  const content = yaml.dump(profile, { lineWidth: 120, noRefs: true, quotingType: '"' })
  const tmpPath = filePath + '.tmp.' + process.pid
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, filePath)
}

export function setPrivacyMode(profile: EngagementProfile, mode: 'private' | 'anonymous' | 'verified'): EngagementProfile {
  if (mode === 'verified' && !profile.identity.erc8004_registered) {
    throw new Error('Verified mode requires erc8004_registered to be true')
  }
  const updated = { ...profile, identity: { ...profile.identity, mode } }
  if (mode === 'anonymous' && !updated.identity.pseudonym) {
    updated.identity.pseudonym = generatePseudonym()
  }
  return updated
}

export function generatePseudonym(): string {
  return 'cipher-' + crypto.randomBytes(2).toString('hex')
}

export function generateNetworkProfile(profile: EngagementProfile): Record<string, unknown> | null {
  if (profile.identity.mode === 'private') return null

  return {
    display_name: profile.identity.mode === 'anonymous'
      ? profile.identity.pseudonym
      : profile.identity.erc8004_address,
    tier: profile.tier.current,
    xp_total: profile.xp.total,
    reputation: profile.reputation.score,
    domains_covered: profile.stats.domains_covered,
    public_engrams: profile.stats.public_engrams,
  }
}

export function ensureEngagementDir(basePath: string): void {
  const dir = engagementDir(basePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Add profile.yaml to .gitignore if not already
  const gitignorePath = path.join(basePath, '.datacore', '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8')
    if (!content.includes('engagement/profile.yaml')) {
      fs.appendFileSync(gitignorePath, '\nengagement/profile.yaml\nengagement/badge.svg\n')
    }
  }
}
