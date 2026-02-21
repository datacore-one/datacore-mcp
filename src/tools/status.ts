// src/tools/status.ts
import * as fs from 'fs'
import * as path from 'path'
import { loadEngrams } from '../engrams.js'
import { currentVersion } from '../version.js'
import { decayedStrength, engramState } from '../decay.js'
import { verifyPackChecksum } from '../trust.js'
import registry from '../../registry/packs.json'

interface StatusPaths {
  engramsPath: string
  journalPath: string
  knowledgePath: string
  packsPath: string
  mode: string
  basePath: string
}

interface StatusResult {
  version: string
  mode: string
  engrams: number
  engram_health?: Record<string, number>
  packs: number
  pack_integrity?: { name: string; valid: boolean }[]
  journal_entries: number
  knowledge_notes: number
  scaling_hint?: string
  update_available?: string
}

export async function handleStatus(
  paths: StatusPaths,
  updateAvailable?: string | null,
): Promise<StatusResult> {
  const engrams = loadEngrams(paths.engramsPath)
  const journalCount = countFiles(paths.journalPath, '.md')
  const knowledgeCount = countFiles(paths.knowledgePath, '.md')
  const packsCount = countDirs(paths.packsPath)

  // Engram health summary by state
  const healthCounts: Record<string, number> = { active: 0, fading: 0, dormant: 0, retirement_candidate: 0 }
  for (const e of engrams) {
    if (e.status !== 'active') continue
    const rs = decayedStrength(e.activation.retrieval_strength, e.activation.last_accessed)
    const state = engramState(rs)
    healthCounts[state]++
  }

  // Pack integrity check
  const packIntegrity: { name: string; valid: boolean }[] = []
  for (const regPack of (registry.packs as Array<{ id: string; checksum?: string }>)) {
    if (!regPack.checksum) continue
    const packDir = path.join(paths.packsPath, regPack.id)
    if (!fs.existsSync(packDir)) continue
    const result = verifyPackChecksum(packDir, regPack.checksum)
    packIntegrity.push({ name: regPack.id, valid: result.valid })
  }

  const result: StatusResult = {
    version: currentVersion,
    mode: paths.mode,
    engrams: engrams.length,
    engram_health: healthCounts,
    packs: packsCount,
    pack_integrity: packIntegrity.length > 0 ? packIntegrity : undefined,
    journal_entries: journalCount,
    knowledge_notes: knowledgeCount,
  }

  if (engrams.length >= 500) {
    result.scaling_hint = `You have ${engrams.length} engrams. Consider migrating to full Datacore for SQLite-backed search.`
  }

  if (updateAvailable) {
    result.update_available = updateAvailable
  }

  return result
}

function countFiles(dir: string, ext: string): number {
  if (!fs.existsSync(dir)) return 0
  let count = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) count += countFiles(fullPath, ext)
    else if (entry.name.endsWith(ext)) count++
  }
  return count
}

function countDirs(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).length
}
