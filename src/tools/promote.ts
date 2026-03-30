// src/tools/promote.ts
import { getPlur } from '../plur-bridge.js'
import { buildHints } from '../hints.js'

interface PromoteArgs { id?: string; ids?: string[] }
interface PromoteResult {
  success: boolean
  promoted: Array<{ id: string; statement: string }>
  errors: Array<{ id: string; error: string }>
  _hints?: ReturnType<typeof buildHints>
}

export async function handlePromote(args: PromoteArgs): Promise<PromoteResult> {
  const plur = getPlur()
  const targetIds = args.ids ?? (args.id ? [args.id] : [])
  if (targetIds.length === 0) {
    return {
      success: false, promoted: [],
      errors: [{ id: '', error: 'At least one engram ID required' }],
      _hints: buildHints({ next: 'Provide an engram ID.', related: ['datacore.recall', 'datacore.status'] }),
    }
  }

  const promoted: PromoteResult['promoted'] = []
  const errors: PromoteResult['errors'] = []

  for (const id of targetIds) {
    const engram = plur.getById(id)
    if (!engram) { errors.push({ id, error: 'Engram not found' }); continue }
    if (engram.status === 'active') { errors.push({ id, error: 'Already active' }); continue }
    if (engram.status === 'retired') { errors.push({ id, error: 'Cannot promote retired engram' }); continue }

    engram.status = 'active'
    engram.activation.retrieval_strength = 0.7
    engram.activation.storage_strength = 1.0
    engram.activation.last_accessed = new Date().toISOString().split('T')[0]
    plur.updateEngram(engram)
    promoted.push({ id: engram.id, statement: engram.statement })
  }

  return {
    success: errors.length === 0, promoted, errors,
    _hints: buildHints({
      next: promoted.length > 0
        ? `Promoted ${promoted.length} engram(s).`
        : 'No engrams were promoted.',
      related: ['datacore.inject', 'datacore.status'],
    }),
  }
}
