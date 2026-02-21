// src/tools/forget.ts
import { loadEngrams, saveEngrams } from '../engrams.js'

interface ForgetArgs {
  id?: string
  search?: string
}

interface ForgetResult {
  success: boolean
  retired?: { id: string; statement: string }
  matches?: Array<{ id: string; statement: string }>
  error?: string
}

export async function handleForget(args: ForgetArgs, engramsPath: string): Promise<ForgetResult> {
  const engrams = loadEngrams(engramsPath)

  if (args.id) {
    const idx = engrams.findIndex(e => e.id === args.id)
    if (idx === -1) {
      return { success: false, error: `Engram ${args.id} not found` }
    }
    const engram = engrams[idx]
    if (engram.status === 'retired') {
      return { success: false, error: `Engram ${args.id} is already retired` }
    }
    engrams[idx] = { ...engram, status: 'retired' }
    saveEngrams(engramsPath, engrams)
    return { success: true, retired: { id: engram.id, statement: engram.statement } }
  }

  if (args.search) {
    const searchLower = args.search.toLowerCase()
    const allMatches = engrams
      .filter(e => e.status !== 'retired')
      .filter(e =>
        e.statement.toLowerCase().includes(searchLower) ||
        e.id.toLowerCase().includes(searchLower) ||
        e.tags.some(t => t.toLowerCase().includes(searchLower))
      )
    const matches = allMatches.slice(0, 100)

    if (matches.length === 0) {
      return { success: false, error: `No active engrams matching "${args.search}"` }
    }
    if (matches.length === 1) {
      const engram = matches[0]
      const idx = engrams.findIndex(e => e.id === engram.id)
      engrams[idx] = { ...engram, status: 'retired' }
      saveEngrams(engramsPath, engrams)
      return { success: true, retired: { id: engram.id, statement: engram.statement } }
    }
    const truncated = allMatches.length > 100
    return {
      success: false,
      matches: matches.map(e => ({ id: e.id, statement: e.statement })),
      total_matches: allMatches.length,
      error: `${allMatches.length} matches found${truncated ? ' (showing first 100)' : ''}. Specify an exact ID to retire.`,
    }
  }

  return { success: false, error: 'Provide either id or search parameter' }
}
