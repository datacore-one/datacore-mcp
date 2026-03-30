// src/tools/inject-tool.ts
import { getPlur } from '../plur-bridge.js'
import { buildHints } from '../hints.js'

interface InjectArgs {
  prompt: string
  scope?: string
  session_id?: string
  max_tokens?: number
  min_relevance?: number
}

export interface InjectResult {
  text: string
  count: number
  tokens_used: number
  injected_personal_ids: string[]
  _hints?: ReturnType<typeof buildHints>
}

export async function handleInject(args: InjectArgs): Promise<InjectResult> {
  const plur = getPlur()

  let result: import('@plur-ai/core').InjectionResult
  try {
    result = await plur.injectHybrid(args.prompt, {
      scope: args.scope,
      budget: args.max_tokens,
    })
  } catch {
    result = plur.inject(args.prompt, {
      scope: args.scope,
      budget: args.max_tokens,
    })
  }

  if (result.count === 0) {
    return {
      text: '', count: 0, tokens_used: 0, injected_personal_ids: [],
      _hints: buildHints({
        next: 'No engrams matched. Use datacore.recall to search, or datacore.learn to record.',
        related: ['datacore.recall', 'datacore.learn'],
      }),
    }
  }

  const lines: string[] = []
  if (result.directives) lines.push('## DIRECTIVES\n', result.directives)
  if (result.constraints) lines.push('\n## CONSTRAINTS\n', result.constraints)
  if (result.consider) lines.push('\n## ALSO CONSIDER\n', result.consider)

  return {
    text: lines.join('\n'),
    count: result.count,
    tokens_used: result.tokens_used,
    injected_personal_ids: result.injected_ids,
    _hints: buildHints({
      next: `After task, call datacore.feedback. IDs: ${result.injected_ids.join(', ')}`,
      related: ['datacore.feedback', 'datacore.session.end'],
    }),
  }
}
