// src/tools/knowledge-scan.ts
import {
  loadKnowledgeSurfacing,
  saveKnowledgeSurfacing,
  scanZettels,
  consolidationPass,
} from '../knowledge-surfacing.js'
import { buildHints } from '../hints.js'

interface KnowledgeScanArgs {
  action: 'scan_zettels' | 'scan_status' | 'consolidation_pass'
  confirm?: boolean
}

export async function handleKnowledgeScan(
  args: KnowledgeScanArgs,
  paths: { knowledgePath: string; knowledgeSurfacingPath: string; engramsPath: string },
): Promise<unknown> {
  switch (args.action) {
    case 'scan_zettels': return scanZettelsAction(paths)
    case 'scan_status': return scanStatusAction(paths.knowledgeSurfacingPath)
    case 'consolidation_pass': return consolidationAction(paths, args.confirm)
    default: throw new Error(`Unknown knowledge.scan action: ${args.action}`)
  }
}

function scanZettelsAction(
  paths: { knowledgePath: string; knowledgeSurfacingPath: string },
) {
  const state = loadKnowledgeSurfacing(paths.knowledgeSurfacingPath)
  const candidates = scanZettels(paths.knowledgePath, state)

  state.zettel_candidates.push(...candidates)
  saveKnowledgeSurfacing(paths.knowledgeSurfacingPath, state)

  return {
    new_candidates: candidates.length,
    total_scanned: state.scanned_paths.length,
    total_pending: state.zettel_candidates.filter(c => c.status === 'pending').length,
    candidates: candidates.map(c => ({
      path: c.path,
      title: c.title,
      suggested_statement: c.suggested_statement,
      suggested_type: c.suggested_type,
      confidence: c.confidence,
    })),
    _hints: buildHints({
      next: candidates.length > 0
        ? `Found ${candidates.length} zettel-to-engram candidate(s). Review and use datacore.learn to create engrams.`
        : 'No new candidates found.',
      related: ['datacore.learn', 'datacore.knowledge.scan'],
    }),
  }
}

function scanStatusAction(surfacingPath: string) {
  const state = loadKnowledgeSurfacing(surfacingPath)
  const pending = state.zettel_candidates.filter(c => c.status === 'pending').length
  const accepted = state.zettel_candidates.filter(c => c.status === 'accepted').length
  const rejected = state.zettel_candidates.filter(c => c.status === 'rejected').length

  return {
    last_scan: state.last_zettel_scan,
    scanned_paths: state.scanned_paths.length,
    candidates: { pending, accepted, rejected, total: state.zettel_candidates.length },
    last_consolidation: state.last_consolidation,
    _hints: buildHints({
      next: pending > 0
        ? `${pending} pending candidate(s). Use scan_zettels to find more, or review candidates.`
        : 'All candidates processed.',
      related: ['datacore.knowledge.scan'],
    }),
  }
}

function consolidationAction(
  paths: { engramsPath: string; knowledgeSurfacingPath: string },
  confirm?: boolean,
) {
  const result = consolidationPass(paths.engramsPath, confirm ?? false)

  // Update state
  const state = loadKnowledgeSurfacing(paths.knowledgeSurfacingPath)
  state.last_consolidation = new Date().toISOString().split('T')[0]
  state.consolidation_results = result
  saveKnowledgeSurfacing(paths.knowledgeSurfacingPath, state)

  return {
    low_rs_count: result.low_rs_engrams.length,
    duplicate_clusters: result.duplicate_clusters.length,
    action: result.action_taken,
    low_rs_engrams: result.low_rs_engrams.slice(0, 10),
    clusters: result.duplicate_clusters.slice(0, 5).map(c => ({
      representative: c.representative,
      duplicates: c.duplicates.length,
    })),
    _hints: buildHints({
      next: result.action_taken === 'preview'
        ? `Preview: ${result.low_rs_engrams.length} low-RS + ${result.duplicate_clusters.length} duplicate cluster(s). Set confirm=true to execute.`
        : `Consolidated: retired ${result.low_rs_engrams.length + result.duplicate_clusters.flatMap(c => c.duplicates).length} engram(s).`,
      related: ['datacore.knowledge.scan'],
    }),
  }
}
