// src/tools/status.ts
import * as fs from 'fs'
import * as path from 'path'
import { loadEngrams } from '../engrams.js'
import { currentVersion } from '../version.js'

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
  packs: number
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

  const result: StatusResult = {
    version: currentVersion,
    mode: paths.mode,
    engrams: engrams.length,
    packs: packsCount,
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
