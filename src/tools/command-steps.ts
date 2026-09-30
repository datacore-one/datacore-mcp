// src/tools/command-steps.ts
// Step tracker for multi-step commands (/today, /wrap-up, ...). Shells out to
// .datacore/lib/command_steps.py so every harness — Claude Code with or without
// its own task tools, any MCP client, agents, unattended runs — keeps the SAME
// checklist: `- [ ]` lines in the day's journal, ticked with a timestamp.
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'
import type { StorageConfig } from '../storage.js'
import { findPython, PYTHON_UNAVAILABLE_MESSAGE } from '../runtime-python.js'
import { resolveCommandFile } from './commands.js'
import { getActor } from '../context.js'

export interface CommandStepsArgs {
  op: 'steps' | 'start' | 'tick' | 'status' | 'resume'
  command?: string
  run_id?: string
  steps?: string[]
  note?: string
  space?: string
  date?: string
}

export async function handleCommandSteps(args: CommandStepsArgs, storage: StorageConfig): Promise<unknown> {
  const script = path.join(storage.basePath, '.datacore', 'lib', 'command_steps.py')
  if (!existsSync(script)) return { op: args.op, error: `step tracker not installed: ${script}` }
  const python = findPython(storage.basePath)
  if (!python) return { op: args.op, error: PYTHON_UNAVAILABLE_MESSAGE }

  const argv: string[] = [script, args.op]
  const need = (field: keyof CommandStepsArgs): string | null =>
    args[field] ? null : `${field} required for op ${args.op}`
  let missing: string | null = null
  switch (args.op) {
    case 'steps':
    case 'start': {
      missing = need('command')
      if (missing) break
      const file = resolveCommandFile(args.command as string, storage)
      if (!file) return { op: args.op, error: `Unknown command: ${args.command}` }
      argv.push(args.command as string, '--file', file)
      if (args.op === 'start' && args.date) argv.push('--date', args.date)
      break
    }
    case 'tick':
      missing = need('run_id') ?? (args.steps && args.steps.length ? null : 'steps required for op tick')
      if (missing) break
      argv.push(args.run_id as string, ...(args.steps as string[]))
      if (args.note) argv.push('--note', args.note)
      break
    case 'status':
      missing = need('run_id')
      if (!missing) argv.push(args.run_id as string)
      break
    case 'resume':
      missing = need('command')
      if (missing) break
      argv.push(args.command as string)
      if (args.date) argv.push('--date', args.date)
      break
    default:
      return { op: args.op, error: `unknown op: ${String(args.op)}` }
  }
  if (missing) return { op: args.op, error: missing }
  if (args.space && args.op !== 'steps') argv.push('--space', args.space)

  const actor = getActor()
  const env = { ...process.env, DATACORE_ROOT: storage.basePath, ...(actor ? { DATACORE_ACTOR: actor } : {}) }
  try {
    const out = execFileSync(python, argv, { encoding: 'utf8', env, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { op: args.op, result: JSON.parse(out) }
  } catch (e) {
    const err = e as { status?: number; stdout?: string }
    // resume exits 1 with `null` when there is no unfinished run: an answer, not an error.
    if (args.op === 'resume' && err.status === 1 && err.stdout?.trim() === 'null') {
      return { op: args.op, result: null }
    }
    try {
      const parsed = JSON.parse(err.stdout ?? '')
      if (parsed && typeof parsed.error === 'string') return { op: args.op, error: parsed.error }
    } catch { /* fall through */ }
    return { op: args.op, error: e instanceof Error ? e.message : String(e) }
  }
}
