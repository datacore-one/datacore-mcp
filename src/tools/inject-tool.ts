// src/tools/inject-tool.ts
import { loadEngrams, loadAllPacks } from '../engrams.js'
import { selectEngrams, type InjectionContext } from '../inject.js'
import type { Engram } from '../schemas/engram.js'

interface InjectArgs {
  prompt: string
  max_tokens?: number
  min_relevance?: number
}

interface InjectResult {
  text: string
  count: number
  tokens_used: number
}

export async function handleInject(
  args: InjectArgs,
  paths: { engramsPath: string; packsPath: string },
): Promise<InjectResult> {
  const personalEngrams = loadEngrams(paths.engramsPath)
  const packs = loadAllPacks(paths.packsPath)

  const ctx: InjectionContext = {
    prompt: args.prompt,
    maxTokens: args.max_tokens,
    minRelevance: args.min_relevance,
  }

  const result = selectEngrams(ctx, personalEngrams, packs)
  const totalCount = result.directives.length + result.consider.length

  if (totalCount === 0) {
    return { text: '', count: 0, tokens_used: 0 }
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

  return { text: lines.join('\n'), count: totalCount, tokens_used: result.tokens_used }
}

function formatEngram(engram: Engram, totalCount: number): string {
  if (totalCount < 10) {
    let text = `- **${engram.statement}**`
    if (engram.rationale) text += `\n  _${engram.rationale}_`
    if (engram.contraindications?.length) {
      text += `\n  Except: ${engram.contraindications.join(', ')}`
    }
    return text
  }
  if (totalCount < 30) {
    const source = engram.pack ? ` [${engram.pack}]` : ''
    return `- ${engram.statement}${source}`
  }
  return `- ${engram.statement}`
}
