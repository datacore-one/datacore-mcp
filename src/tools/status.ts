// src/tools/status.ts
import * as fs from 'fs'
import * as path from 'path'
import { getPlur } from '../plur-bridge.js'
import { currentVersion } from '../version.js'
import { verifyPackChecksum } from '../trust.js'
import { localDate } from './capture.js'
import { buildHints } from '../hints.js'
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
  episodes: number
  packs: number
  pack_integrity?: { name: string; valid: boolean }[]
  journal_entries: number
  knowledge_notes: number
  scaling_hint?: string
  update_available?: string
  _recommendations?: string[]
  _hints?: ReturnType<typeof buildHints>
}

export async function handleStatus(
  paths: StatusPaths,
  updateAvailable?: string | null,
): Promise<StatusResult> {
  const plur = getPlur()
  const plurStatus = plur.status()
  const journalCount = countFiles(paths.journalPath, '.md')
  const knowledgeCount = countFiles(paths.knowledgePath, '.md')

  // Pack integrity check
  const packIntegrity: { name: string; valid: boolean }[] = []
  for (const regPack of (registry.packs as Array<{ id: string; checksum?: string }>)) {
    if (!regPack.checksum) continue
    const packDir = path.join(paths.packsPath, regPack.id)
    if (!fs.existsSync(packDir)) continue
    const result = verifyPackChecksum(packDir, regPack.checksum)
    packIntegrity.push({ name: regPack.id, valid: result.valid })
  }

  // Build recommendations
  const recommendations: string[] = []

  // Check for today's journal
  const { date: today } = localDate()
  const todayJournal = path.join(paths.journalPath, `${today}.md`)
  if (!fs.existsSync(todayJournal)) {
    recommendations.push('No journal entry today. Use datacore.capture to start one.')
  }

  if (updateAvailable) {
    recommendations.push(`Update available: ${updateAvailable}. Run: npm update -g @datacore-one/mcp`)
  }

  const statusResult: StatusResult = {
    version: currentVersion,
    mode: paths.mode,
    engrams: plurStatus.engram_count,
    episodes: plurStatus.episode_count,
    packs: plurStatus.pack_count,
    pack_integrity: packIntegrity.length > 0 ? packIntegrity : undefined,
    journal_entries: journalCount,
    knowledge_notes: knowledgeCount,
    _recommendations: recommendations.length > 0 ? recommendations : undefined,
    _hints: buildHints({
      next: recommendations.length > 0
        ? recommendations[0]
        : 'System healthy. Use datacore.session.start to begin working.',
      related: ['datacore.promote', 'datacore.forget'],
    }),
  }

  if (plurStatus.engram_count >= 500) {
    statusResult.scaling_hint = `You have ${plurStatus.engram_count} engrams. Consider migrating to full Datacore for SQLite-backed search.`
  }

  if (updateAvailable) {
    statusResult.update_available = updateAvailable
  }

  return statusResult
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
