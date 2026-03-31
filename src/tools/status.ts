// src/tools/status.ts
import * as fs from 'fs'
import * as path from 'path'
import { currentVersion } from '../version.js'
import { localDate } from './capture.js'
import { buildHints } from '../hints.js'

interface StatusPaths {
  journalPath: string
  knowledgePath: string
  packsPath: string
  mode: string
  basePath: string
}

interface StatusResult {
  version: string
  mode: string
  journal_entries: number
  knowledge_notes: number
  update_available?: string
  _recommendations?: string[]
  _hints?: ReturnType<typeof buildHints>
}

export async function handleStatus(
  paths: StatusPaths,
  updateAvailable?: string | null,
): Promise<StatusResult> {
  const journalCount = countFiles(paths.journalPath, '.md')
  const knowledgeCount = countFiles(paths.knowledgePath, '.md')

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
    journal_entries: journalCount,
    knowledge_notes: knowledgeCount,
    _recommendations: recommendations.length > 0 ? recommendations : undefined,
    _hints: buildHints({
      next: recommendations.length > 0
        ? recommendations[0]
        : 'System healthy. Use datacore.capture to write a journal entry.',
      related: ['datacore.search', 'datacore.capture'],
    }),
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
