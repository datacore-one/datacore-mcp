// src/tools/forget.ts
import { getPlur } from '../plur-bridge.js'

interface ForgetArgs { id?: string; search?: string }
interface ForgetResult {
  success: boolean
  retired?: { id: string; statement: string }
  matches?: Array<{ id: string; statement: string }>
  total_matches?: number
  error?: string
}

export async function handleForget(args: ForgetArgs): Promise<ForgetResult> {
  const plur = getPlur()

  if (args.id) {
    const engram = plur.getById(args.id)
    if (!engram) return { success: false, error: `Engram ${args.id} not found` }
    if (engram.status === 'retired') return { success: false, error: `Engram ${args.id} is already retired` }
    plur.forget(args.id)
    return { success: true, retired: { id: engram.id, statement: engram.statement } }
  }

  if (args.search) {
    const matches = plur.recall(args.search, { limit: 100 })
    if (matches.length === 0) return { success: false, error: `No active engrams matching "${args.search}"` }
    if (matches.length === 1) {
      plur.forget(matches[0].id)
      return { success: true, retired: { id: matches[0].id, statement: matches[0].statement } }
    }
    return {
      success: false,
      matches: matches.map(e => ({ id: e.id, statement: e.statement })),
      total_matches: matches.length,
      error: `${matches.length} matches found. Specify an exact ID to retire.`,
    }
  }

  return { success: false, error: 'Provide either id or search parameter' }
}
