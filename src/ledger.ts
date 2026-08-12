// src/ledger.ts
/**
 * Is this installation's ledger intact?
 *
 * datacore_status reported "System healthy" from journal and note COUNTS — a
 * number that is equally correct on an installation whose event chain is
 * broken, whose transport is missing, or whose Python cannot load the ledger at
 * all. That is the tool an agent calls to check on itself after updating, so it
 * was answering the easy question and staying silent on the load-bearing one.
 *
 * Two rules, both learned the hard way:
 *
 *   ok:null is not ok:false. An installation predating the ledger needs an
 *   update, not an incident report; a probe that could not run has produced no
 *   finding at all. Collapsing those into "broken" manufactures alarms, and
 *   collapsing them into "fine" is how a machine sat six weeks behind while
 *   every dashboard stayed green.
 *
 *   Resolve Python by CAPABILITY, not by name. macOS ships 3.9 as `python3`,
 *   and the ledger's modules use PEP-604 unions at import time — so 3.9 raises
 *   TypeError before executing a line. Probing with bare `python3` reports a
 *   perfectly healthy ledger as unreadable on the most common dev machine.
 */

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface LedgerHealth {
  ok: boolean | null
  detail: string
  spaces_verified?: number
  python?: string
}

const MIN_MAJOR = 3
const MIN_MINOR = 10

let cachedPython: string | null | undefined

function findPython(): string | null {
  if (cachedPython !== undefined) return cachedPython
  const candidates = [
    process.env.DATACORE_PYTHON,
    'python3.13',
    'python3.12',
    'python3.11',
    'python3.10',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3',
  ].filter(Boolean) as string[]

  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      const parts = out.split('.').map(Number)
      const maj = parts[0]
      const min = parts[1]
      if (maj === undefined || min === undefined) continue
      if (maj > MIN_MAJOR || (maj === MIN_MAJOR && min >= MIN_MINOR)) {
        cachedPython = bin
        return cachedPython
      }
    } catch {
      // Not installed here — try the next candidate.
    }
  }
  cachedPython = null
  return cachedPython
}

/** Test seam — resolution is cached because probing spawns processes. */
export function resetPythonCache(): void {
  cachedPython = undefined
}

/**
 * Verify every writer's hash chain in every space that has one.
 *
 * Kept synchronous and bounded: this runs inside a status call an agent is
 * waiting on, so a hung probe would turn "how am I doing?" into a stalled tool.
 */
export function checkLedgerHealth(basePath: string): LedgerHealth {
  const ledgerCli = path.join(basePath, '.datacore', 'lib', 'ledger_cli.py')
  if (!fs.existsSync(ledgerCli)) {
    return { ok: null, detail: 'no ledger in this installation (pre-v2) — run: datacore update' }
  }

  const python = findPython()
  if (!python) {
    return {
      ok: null,
      detail: `no python >= ${MIN_MAJOR}.${MIN_MINOR} (macOS system python3 is 3.9 and cannot load the ledger) — set DATACORE_PYTHON`,
    }
  }

  let spaces: string[]
  try {
    spaces = fs
      .readdirSync(basePath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d-/.test(e.name))
      .map((e) => path.join(basePath, e.name))
      .filter((p) => fs.existsSync(path.join(p, '.datacore', 'events')))
  } catch {
    return { ok: null, detail: 'could not enumerate spaces', python }
  }

  if (spaces.length === 0) {
    return { ok: null, detail: 'no space carries an event log yet', python }
  }

  const broken: string[] = []
  const unverifiable: string[] = []
  for (const space of spaces) {
    try {
      execFileSync(python, [ledgerCli, 'verify', '--space', space], {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err: unknown) {
      // A numeric exit status is a VERDICT (chain broken). A spawn failure is
      // the absence of one. Reporting the second as the first would raise an
      // incident because an interpreter moved.
      const e = err as { status?: number }
      if (typeof e.status === 'number') broken.push(path.basename(space))
      else unverifiable.push(path.basename(space))
    }
  }

  if (broken.length > 0) {
    return {
      ok: false,
      detail: `hash chain BROKEN in ${broken.join(', ')} — folded state is untrustworthy; run ledger_cli.py verify`,
      spaces_verified: spaces.length - broken.length - unverifiable.length,
      python,
    }
  }
  if (unverifiable.length === spaces.length) {
    return { ok: null, detail: `could not verify ${unverifiable.join(', ')}`, python }
  }
  const verified = spaces.length - unverifiable.length
  return {
    ok: true,
    detail:
      `${verified} space(s) verified` +
      (unverifiable.length ? `, ${unverifiable.length} unverifiable` : ''),
    spaces_verified: verified,
    python,
  }
}
