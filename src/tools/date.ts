// src/tools/date.ts
// Canonical date operations — shells out to .datacore/lib/date_utils.py
// so Python and TS agents share one source of truth.
import { execFileSync } from 'child_process'
import * as path from 'path'

interface DateArgs {
  op: 'today' | 'dow' | 'validate' | 'add' | 'sub' | 'diff' | 'parse' | 'org-stamp'
  date?: string
  date2?: string
  day?: string
  n?: number
  expr?: string
  inactive?: boolean
}

interface DateResult {
  op: string
  result?: string | number | boolean
  date?: string
  dow?: string
  valid?: boolean
  error?: string
}

function findScript(basePath: string): string {
  // Try the installation basePath first, then fall back to ~/Data
  const candidates = [
    path.join(basePath, '.datacore', 'lib', 'date_utils.py'),
    path.join(process.env.HOME || '', 'Data', '.datacore', 'lib', 'date_utils.py'),
  ]
  for (const c of candidates) {
    try {
      require('fs').accessSync(c)
      return c
    } catch {
      // continue
    }
  }
  return candidates[0] // let execFile fail with a clear error
}

export async function handleDate(args: DateArgs, basePath: string): Promise<DateResult> {
  const script = findScript(basePath)
  const cmd: string[] = [script]

  try {
    switch (args.op) {
      case 'today':
        cmd.push('today')
        break
      case 'dow':
        if (!args.date) return { op: args.op, error: 'date required' }
        cmd.push('dow', args.date)
        break
      case 'validate':
        if (!args.date || !args.day) return { op: args.op, error: 'date and day required' }
        cmd.push('validate', args.date, args.day)
        break
      case 'add':
        if (!args.date || args.n == null) return { op: args.op, error: 'date and n required' }
        cmd.push('add', args.date, String(args.n))
        break
      case 'sub':
        if (!args.date || args.n == null) return { op: args.op, error: 'date and n required' }
        cmd.push('sub', args.date, String(args.n))
        break
      case 'diff':
        if (!args.date || !args.date2) return { op: args.op, error: 'date and date2 required' }
        cmd.push('diff', args.date, args.date2)
        break
      case 'parse':
        if (!args.expr) return { op: args.op, error: 'expr required' }
        cmd.push('parse', args.expr)
        break
      case 'org-stamp':
        if (!args.date) return { op: args.op, error: 'date required' }
        cmd.push('org-stamp', args.date)
        if (args.inactive) cmd.push('--inactive')
        break
      default:
        return { op: args.op, error: `unknown op: ${args.op}` }
    }

    const out = execFileSync('python3', cmd, { encoding: 'utf8' }).trim()

    // Shape the response
    if (args.op === 'today') {
      const [date, dow] = out.split(' ')
      return { op: args.op, date, dow, result: out }
    }
    if (args.op === 'validate') {
      return { op: args.op, valid: out.startsWith('ok'), result: out }
    }
    if (args.op === 'diff') {
      return { op: args.op, result: parseInt(out, 10) }
    }
    if (args.op === 'add' || args.op === 'sub' || args.op === 'parse') {
      const [date, dow] = out.split(' ')
      return { op: args.op, date, dow, result: out }
    }
    return { op: args.op, result: out }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // validate returns exit 1 on mismatch — still a valid answer
    if (args.op === 'validate' && msg.includes('mismatch')) {
      return { op: args.op, valid: false, result: msg }
    }
    return { op: args.op, error: msg }
  }
}
