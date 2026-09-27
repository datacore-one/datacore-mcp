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
/**
 * THE ANSWER MUST ARRIVE INSIDE THE CALLER'S TIME LIMIT (MOD-7). Verifying every
 * chain takes ~18 s on a large installation (20k events in one space), and the
 * status call around it has 30 s before the harness reports the whole server
 * broken. So a verdict is remembered for a short while, and a fresh check that
 * does not finish in its budget reports the last verdict AS OLD -- never as a
 * current "ok" -- instead of making the tool time out.
 */
const CACHE_TTL_MS = 10 * 60 * 1000
const VERIFY_BUDGET_MS = 15000

interface CachedHealth { checked_at: number; health: LedgerHealth }

function cachePath(basePath: string): string {
  return path.join(basePath, '.datacore', 'state', 'ledger-health.json')
}

function readCache(basePath: string): CachedHealth | null {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath(basePath), 'utf8')) as CachedHealth
    if (typeof c.checked_at !== 'number' || !c.health || ![true, false, null].includes(c.health.ok)) return null
    return c
  } catch {
    return null
  }
}

function writeCache(basePath: string, health: LedgerHealth): void {
  try {
    fs.mkdirSync(path.dirname(cachePath(basePath)), { recursive: true })
    const tmp = `${cachePath(basePath)}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ checked_at: Date.now(), health }))
    fs.renameSync(tmp, cachePath(basePath))
  } catch {
    // A verdict that cannot be remembered is still a verdict.
  }
}

function ago(ms: number): string {
  const min = Math.round(ms / 60000)
  return min < 90 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

export function checkLedgerHealth(basePath: string): LedgerHealth {
  const cached = readCache(basePath)
  if (cached && Date.now() - cached.checked_at < CACHE_TTL_MS) {
    return { ...cached.health, detail: `${cached.health.detail} (checked ${ago(Date.now() - cached.checked_at)})` }
  }
  const fresh = verifyLedger(basePath, VERIFY_BUDGET_MS)
  if (fresh.timedOut) {
    if (cached) {
      // Broken stays broken until a check says otherwise; ok becomes "could not tell".
      return {
        ok: cached.health.ok === false ? false : null,
        python: fresh.health.python,
        detail: `a fresh check did not finish in ${VERIFY_BUDGET_MS / 1000} s; last verdict ${ago(Date.now() - cached.checked_at)}: ${cached.health.detail}`,
      }
    }
    return fresh.health
  }
  if (fresh.cacheable) writeCache(basePath, fresh.health)
  return fresh.health
}

function verifyLedger(basePath: string, budgetMs: number): { health: LedgerHealth; timedOut: boolean; cacheable: boolean } {
  const explicit = process.env.DATACORE_LIB
  const library = explicit ?? path.join(basePath, '.datacore', 'lib')
  if (!library || !path.isAbsolute(library)) {
    return { health: { ok: null, detail: 'installed ledger library is unavailable; set DATACORE_LIB' }, timedOut: false, cacheable: false }
  }
  const helper = path.join(library, 'ledger_health.py')
  if (!fs.existsSync(helper)) {
    return { health: { ok: null, detail: 'installed ledger verification helper unavailable (pre-v2 or incomplete installation); reconcile the qualified release' }, timedOut: false, cacheable: false }
  }
  const python = findPython(basePath)
  if (!python) return { health: { ok: null, detail: 'selected Python is unavailable or incompatible; reconcile DATACORE_PYTHON' }, timedOut: false, cacheable: false }
  try {
    const raw = execFileSync(python, ['-I', helper, '--root', basePath], {
      encoding: 'utf8', timeout: budgetMs, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'],
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
      health: {
        ok, python, spaces_verified: verified,
        detail: broken ? `ledger chain BROKEN in ${broken} space(s)`
          : ok ? `${verified} space(s) verified`
          : `ledger verification incomplete: ${verified} verified, ${unverified} unverified`,
      },
      timedOut: false,
      cacheable: true,
    }
  } catch (err) {
    const e = err as { code?: string; signal?: string }
    const timedOut = e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM'
    return {
      health: {
        ok: null, python,
        detail: timedOut
          ? `ledger verification did not finish in ${budgetMs / 1000} s; run: python3 .datacore/lib/ledger_health.py --root ${basePath}`
          : 'installed ledger verifier failed or returned an invalid response',
      },
      timedOut,
      cacheable: false,
    }
  }
}
