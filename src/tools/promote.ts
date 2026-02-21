// src/tools/promote.ts
import { loadEngrams } from '../engrams.js'
import { atomicWriteYaml } from './inject-tool.js'
import { buildHints } from '../hints.js'

interface PromoteArgs {
  id?: string
  ids?: string[]
}

interface PromoteResultItem {
  id: string
  statement: string
}

interface PromoteErrorItem {
  id: string
  error: string
}

interface PromoteResult {
  success: boolean
  promoted: PromoteResultItem[]
  errors: PromoteErrorItem[]
  _hints?: ReturnType<typeof buildHints>
}

export async function handlePromote(
  args: PromoteArgs,
  engramsPath: string,
): Promise<PromoteResult> {
  const targetIds = args.ids ?? (args.id ? [args.id] : [])

  if (targetIds.length === 0) {
    return {
      success: false,
      promoted: [],
      errors: [{ id: '', error: 'At least one engram ID required (id or ids)' }],
      _hints: buildHints({
        next: 'Provide an engram ID. Use datacore.search or datacore.status to find valid IDs.',
        related: ['datacore.search', 'datacore.status'],
      }),
    }
  }

  const engrams = loadEngrams(engramsPath)
  const today = new Date().toISOString().split('T')[0]
  const promoted: PromoteResultItem[] = []
  const errors: PromoteErrorItem[] = []

  for (const id of targetIds) {
    const engram = engrams.find(e => e.id === id)
    if (!engram) {
      errors.push({ id, error: 'Engram not found' })
      continue
    }
    if (engram.status === 'active') {
      errors.push({ id, error: 'Already active' })
      continue
    }
    if (engram.status === 'retired') {
      errors.push({ id, error: 'Cannot promote retired engram' })
      continue
    }

    engram.status = 'active'
    engram.activation.retrieval_strength = 0.7
    engram.activation.storage_strength = 1.0
    engram.activation.last_accessed = today
    promoted.push({ id: engram.id, statement: engram.statement })
  }

  if (promoted.length > 0) {
    atomicWriteYaml(engramsPath, { engrams })
  }

  return {
    success: errors.length === 0,
    promoted,
    errors,
    _hints: buildHints({
      next: promoted.length > 0
        ? `Promoted ${promoted.length} engram(s). They will now appear in inject results.`
        : 'No engrams were promoted. Check the errors above.',
      related: ['datacore.inject', 'datacore.status'],
    }),
  }
}
