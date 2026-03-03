// src/tools/inject-tool.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { loadEngrams, loadAllPacks } from '../engrams.js'
import { selectAndSpread, type InjectionContext, type WireEngram } from '../inject.js'
import { buildHints } from '../hints.js'
import type { Engram, KnowledgeAnchor } from '../schemas/engram.js'

interface InjectArgs {
  prompt: string
  scope?: string
  session_id?: string
  max_tokens?: number
  min_relevance?: number
}

interface InjectResult {
  text: string
  count: number
  tokens_used: { directives: number; consider: number }
  related_documents?: number
  _hints?: ReturnType<typeof buildHints>
}

export async function handleInject(
  args: InjectArgs,
  paths: { engramsPath: string; packsPath: string },
): Promise<InjectResult> {
  const personalEngrams = loadEngrams(paths.engramsPath)
  const packs = loadAllPacks(paths.packsPath)

  const ctx: InjectionContext = {
    prompt: args.prompt,
    scope: args.scope,
    session_id: args.session_id,
    maxTokens: args.max_tokens,
    minRelevance: args.min_relevance,
  }

  const result = selectAndSpread(ctx, personalEngrams, packs)
  const totalCount = result.directives.length + result.consider.length

  if (totalCount === 0) {
    return {
      text: '', count: 0, tokens_used: { directives: 0, consider: 0 },
      _hints: buildHints({
        next: 'No engrams matched this task. Use datacore.recall to search all sources, or datacore.learn to record new knowledge.',
        related: ['datacore.recall', 'datacore.learn'],
      }),
    }
  }

  const lines: string[] = []
  if (result.directives.length > 0) {
    lines.push('## DIRECTIVES\n')
    for (const e of result.directives) {
      lines.push(formatEngram(e, totalCount))
    }
  }
  if (result.consider.length > 0) {
    lines.push('\n## ALSO CONSIDER\n')
    for (const e of result.consider) {
      lines.push(formatEngram(e, totalCount))
    }
  }
  if (result.related_documents.length > 0) {
    lines.push('\n' + formatRelatedDocs(result.related_documents))
  }

  // Update usage tracking for selected personal engrams
  updateUsageTracking(
    paths.engramsPath,
    personalEngrams,
    [...result.directives, ...result.consider],
  )

  const injectedIds = [...result.directives, ...result.consider]
    .filter(e => !e.pack)
    .map(e => e.id)

  const idsList = injectedIds.length > 0 ? ` Injected IDs: ${injectedIds.join(', ')}` : ''

  return {
    text: lines.join('\n'),
    count: totalCount,
    tokens_used: result.tokens_used,
    related_documents: result.related_documents.length > 0 ? result.related_documents.length : undefined,
    _hints: buildHints({
      next: `After task, call datacore.feedback on helpful/unhelpful engrams.${idsList}`,
      related: ['datacore.feedback', 'datacore.session.end'],
    }),
  }
}

function updateUsageTracking(
  engramsPath: string,
  allPersonal: Engram[],
  selected: WireEngram[],
): void {
  const selectedPersonalIds = new Set(
    selected.filter(e => !e.pack).map(e => e.id),
  )
  if (selectedPersonalIds.size === 0) return

  const today = new Date().toISOString().split('T')[0]
  let changed = false

  for (const engram of allPersonal) {
    if (selectedPersonalIds.has(engram.id)) {
      engram.activation.last_accessed = today
      engram.activation.frequency += 1
      changed = true
    }
  }

  if (changed) {
    atomicWriteYaml(engramsPath, { engrams: allPersonal })
  }
}

export function atomicWriteYaml(filePath: string, data: unknown): void {
  const content = yaml.dump(data, { lineWidth: 120, noRefs: true, quotingType: '"' })
  const tmpPath = filePath + '.tmp.' + process.pid
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, filePath)
}

function formatEngram(engram: WireEngram, totalCount: number): string {
  if (totalCount < 10) {
    let text = `- **${engram.statement}**`
    if (engram.rationale) text += `\n  _${engram.rationale}_`
    if (engram.contraindications?.length) {
      text += `\n  Except: ${engram.contraindications.join(', ')}`
    }
    if (engram.dual_coding) {
      if (engram.dual_coding.example) text += `\n  Example: ${engram.dual_coding.example}`
      if (engram.dual_coding.analogy) text += `\n  Analogy: ${engram.dual_coding.analogy}`
    }
    return text
  }
  if (totalCount < 30) {
    const source = engram.pack ? ` [${engram.pack}]` : ''
    return `- ${engram.statement}${source}`
  }
  return `- ${engram.statement}`
}

function formatRelatedDocs(docs: KnowledgeAnchor[]): string {
  const lines: string[] = ['## RELATED DOCUMENTS\n']
  for (const doc of docs) {
    let line = `- [${doc.relevance}] ${doc.path}`
    if (doc.snippet) line += ` — "${doc.snippet}"`
    lines.push(line)
  }
  return lines.join('\n')
}
