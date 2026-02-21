// src/tools/feedback.ts
// Supports feedback on ALL engrams — personal and pack engrams alike.
// Pack engram feedback is written back to the pack's own engrams.yaml.
import * as path from 'path'
import { loadEngrams, loadAllPacks, type LoadedPack } from '../engrams.js'
import { atomicWriteYaml } from './inject-tool.js'
import { buildHints } from '../hints.js'

type Signal = 'positive' | 'negative' | 'neutral'

interface FeedbackArgs {
  engram_id?: string
  signal?: Signal
  signals?: Array<{ engram_id: string; signal: Signal }>
  comment?: string
}

interface SingleFeedbackResult {
  mode: 'single'
  success: boolean
  engram_id: string
  signal: string
  source?: 'personal' | 'pack'
  feedback_signals?: { positive: number; negative: number; neutral: number }
  error?: string
  _hints?: ReturnType<typeof buildHints>
}

interface BatchFeedbackResult {
  mode: 'batch'
  results: Array<{ engram_id: string; signal: string; success: boolean; source?: 'personal' | 'pack'; error?: string }>
  summary: { positive: number; negative: number; neutral: number }
  _hints?: ReturnType<typeof buildHints>
}

// Locate an engram across personal + all packs
interface FoundEngram {
  engram: import('../schemas/engram.js').Engram
  source: 'personal' | 'pack'
  // For personal: allEngrams array + engramsPath
  personalEngrams?: import('../schemas/engram.js').Engram[]
  // For pack: the pack's engrams array + pack engrams.yaml path
  packEngrams?: import('../schemas/engram.js').Engram[]
  packEngramsPath?: string
}

function findEngram(engramId: string, engramsPath: string, packsPath: string): FoundEngram | null {
  // Check personal first
  const personal = loadEngrams(engramsPath)
  const found = personal.find(e => e.id === engramId)
  if (found) return { engram: found, source: 'personal', personalEngrams: personal }

  // Check packs
  const packs = loadAllPacks(packsPath)
  for (const pack of packs) {
    const packEngram = pack.engrams.find(e => e.id === engramId)
    if (packEngram) {
      const packId = pack.manifest['x-datacore']?.id
      const packEngramsPath = packId ? path.join(packsPath, packId, 'engrams.yaml') : undefined
      return { engram: packEngram, source: 'pack', packEngrams: pack.engrams, packEngramsPath }
    }
  }

  return null
}

export async function handleFeedback(
  args: FeedbackArgs,
  engramsPath: string,
  packsPath?: string,
): Promise<SingleFeedbackResult | BatchFeedbackResult> {
  const pPath = packsPath ?? path.join(path.dirname(engramsPath), 'packs')

  if (args.signals && args.signals.length > 0) {
    return handleBatchFeedback(args.signals, engramsPath, pPath)
  }

  return handleSingleFeedback(args.engram_id!, args.signal!, args.comment, engramsPath, pPath)
}

async function handleSingleFeedback(
  engram_id: string,
  signal: Signal,
  comment: string | undefined,
  engramsPath: string,
  packsPath: string,
): Promise<SingleFeedbackResult> {
  const found = findEngram(engram_id, engramsPath, packsPath)

  if (!found) {
    return {
      mode: 'single',
      success: false,
      engram_id,
      signal,
      error: `Engram ${engram_id} not found`,
      _hints: buildHints({
        next: 'Engram not found. Use datacore.search or datacore.status to find valid IDs.',
        related: ['datacore.search', 'datacore.status'],
      }),
    }
  }

  const today = new Date().toISOString().split('T')[0]
  if (!found.engram.feedback_signals) {
    found.engram.feedback_signals = { positive: 0, negative: 0, neutral: 0 }
  }
  found.engram.feedback_signals[signal] += 1
  found.engram.activation.last_accessed = today

  // Write back to the correct file
  if (found.source === 'personal' && found.personalEngrams) {
    atomicWriteYaml(engramsPath, { engrams: found.personalEngrams })
  } else if (found.source === 'pack' && found.packEngrams && found.packEngramsPath) {
    atomicWriteYaml(found.packEngramsPath, { engrams: found.packEngrams })
  }

  return {
    mode: 'single',
    success: true,
    engram_id,
    signal,
    source: found.source,
    feedback_signals: { ...found.engram.feedback_signals },
  }
}

async function handleBatchFeedback(
  signals: Array<{ engram_id: string; signal: Signal }>,
  engramsPath: string,
  packsPath: string,
): Promise<BatchFeedbackResult> {
  const today = new Date().toISOString().split('T')[0]
  const results: Array<{ engram_id: string; signal: string; success: boolean; source?: 'personal' | 'pack'; error?: string }> = []
  const summary = { positive: 0, negative: 0, neutral: 0 }

  // Load all sources once upfront to avoid reloading on each iteration
  const personal = loadEngrams(engramsPath)
  const packs = loadAllPacks(packsPath)
  let personalDirty = false
  const dirtyPackFiles = new Map<string, import('../schemas/engram.js').Engram[]>()

  for (const { engram_id, signal } of signals) {
    // Search personal engrams first
    let engram = personal.find(e => e.id === engram_id)
    let source: 'personal' | 'pack' | undefined

    if (engram) {
      source = 'personal'
    } else {
      // Search packs
      for (const pack of packs) {
        engram = pack.engrams.find(e => e.id === engram_id)
        if (engram) {
          source = 'pack'
          const packId = pack.manifest['x-datacore']?.id
          if (packId) {
            dirtyPackFiles.set(
              path.join(packsPath, packId, 'engrams.yaml'),
              pack.engrams,
            )
          }
          break
        }
      }
    }

    if (!engram || !source) {
      results.push({ engram_id, signal, success: false, error: `Engram ${engram_id} not found` })
      continue
    }

    if (!engram.feedback_signals) {
      engram.feedback_signals = { positive: 0, negative: 0, neutral: 0 }
    }
    engram.feedback_signals[signal] += 1
    engram.activation.last_accessed = today
    summary[signal]++

    if (source === 'personal') personalDirty = true
    results.push({ engram_id, signal, success: true, source })
  }

  // Write dirty files
  if (personalDirty) {
    atomicWriteYaml(engramsPath, { engrams: personal })
  }
  for (const [filePath, engrams] of dirtyPackFiles) {
    atomicWriteYaml(filePath, { engrams })
  }

  return {
    mode: 'batch',
    results,
    summary,
    _hints: buildHints({
      next: `Batch feedback recorded: ${summary.positive} positive, ${summary.negative} negative, ${summary.neutral} neutral.`,
      related: ['datacore.session.end', 'datacore.status'],
    }),
  }
}
