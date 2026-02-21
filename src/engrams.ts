// src/engrams.ts
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { EngramSchema, PackManifestSchema, type Engram, type PackManifest } from './schemas/engram.js'
import { logger } from './logger.js'

export function loadEngrams(filePath: string): Engram[] {
  if (!fs.existsSync(filePath)) return []

  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf8')) as any
    if (!raw?.engrams || !Array.isArray(raw.engrams)) return []

    const valid: Engram[] = []
    let skipped = 0
    for (const entry of raw.engrams) {
      const result = EngramSchema.safeParse(entry)
      if (result.success) {
        valid.push(result.data)
      } else {
        skipped++
      }
    }
    if (skipped > 0) {
      logger.warning(`Skipped ${skipped} invalid engram(s) in ${filePath}`)
    }
    return valid
  } catch (err) {
    logger.error(`Failed to parse engrams file ${filePath}: ${err}`)
    return []
  }
}

export function saveEngrams(filePath: string, engrams: Engram[]): void {
  const content = yaml.dump({ engrams }, { lineWidth: 120, noRefs: true, quotingType: '"' })
  fs.writeFileSync(filePath, content)
}

export interface LoadedPack {
  manifest: PackManifest
  engrams: Engram[]
}

function parseSkillMdFrontmatter(filePath: string): Record<string, any> {
  const content = fs.readFileSync(filePath, 'utf8')
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error(`No frontmatter found in ${filePath}`)
  try {
    return yaml.load(match[1]) as Record<string, any>
  } catch (err) {
    throw new Error(`Failed to parse YAML frontmatter in ${filePath}: ${err}`)
  }
}

export function loadPack(packDir: string): LoadedPack {
  const skillMdPath = `${packDir}/SKILL.md`
  const engramsPath = `${packDir}/engrams.yaml`

  const rawManifest = parseSkillMdFrontmatter(skillMdPath)
  const manifest = PackManifestSchema.parse(rawManifest)
  const engrams = loadEngrams(engramsPath)

  return { manifest, engrams }
}

export function loadAllPacks(packsDir: string): LoadedPack[] {
  if (!fs.existsSync(packsDir)) return []

  const packs: LoadedPack[] = []
  for (const entry of fs.readdirSync(packsDir)) {
    const packDir = `${packsDir}/${entry}`
    if (!fs.statSync(packDir).isDirectory()) continue
    if (!fs.existsSync(`${packDir}/SKILL.md`)) continue

    try {
      packs.push(loadPack(packDir))
    } catch (err) {
      logger.warning(`Failed to load pack ${entry}: ${err}`)
    }
  }
  return packs
}
