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

import { findPython } from './runtime-python.js'
export { resetPythonCache } from './runtime-python.js'

/**
 * Verify every writer's hash chain in every space that has one.
 *
 * Kept synchronous and bounded: this runs inside a status call an agent is
 * waiting on, so a hung probe would turn "how am I doing?" into a stalled tool.
 */
export function checkLedgerHealth(basePath: string): LedgerHealth {
  const explicit = process.env.DATACORE_LIB
  const library = explicit ?? path.join(basePath, '.datacore', 'lib')
  if (!library || !path.isAbsolute(library)) {
    return { ok: null, detail: 'installed ledger library is unavailable; set DATACORE_LIB' }
  }
  const helper = path.join(library, 'ledger_health.py')
  if (!fs.existsSync(helper)) {
    return { ok: null, detail: 'installed ledger verification helper unavailable (pre-v2 or incomplete installation); reconcile the qualified release' }
  }
  const python = findPython()
  if (!python) return { ok: null, detail: 'selected Python is unavailable or incompatible; reconcile DATACORE_PYTHON' }
  try {
    const raw = execFileSync(python, ['-I', helper, '--root', basePath], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const result = JSON.parse(raw) as Record<string, unknown>
    const keys = ['spaces_verified', 'spaces_broken', 'spaces_unverified']
    if (!result || result.version !== 1 || ![true, false, null].includes(result.ok as boolean | null)
      || keys.some(key => typeof result[key] !== 'number' || !Number.isSafeInteger(result[key]) || Number(result[key]) < 0)) {
      throw new Error('invalid verification response')
    }
    const verified = Number(result.spaces_verified)
    const broken = Number(result.spaces_broken)
    const unverified = Number(result.spaces_unverified)
    const ok = broken > 0 ? false : result.ok === true && verified > 0 && unverified === 0 ? true : null
    return {
      ok, python, spaces_verified: verified,
      detail: broken ? `ledger chain BROKEN in ${broken} space(s)`
        : ok ? `${verified} space(s) verified`
        : `ledger verification incomplete: ${verified} verified, ${unverified} unverified`,
    }
  } catch {
    return { ok: null, python, detail: 'installed ledger verifier failed or returned an invalid response' }
  }
}
