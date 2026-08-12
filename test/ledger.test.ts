// test/ledger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { checkLedgerHealth, resetPythonCache } from '../src/ledger.js'
import { currentVersion } from '../src/version.js'
import pkg from '../package.json'

// Every call probes up to eight interpreters (one process each) and then runs
// verify per space, so the 5s default is not a real budget for this work.
const SLOW = 30000

describe('version is single-sourced', () => {
  it('currentVersion equals package.json', () => {
    expect(currentVersion).toBe(pkg.version)
  })
})

describe('checkLedgerHealth', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-mcp-ledger-'))
    resetPythonCache()
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  function withLedger(exitCode: number, space = '0-personal'): void {
    fs.mkdirSync(path.join(dir, '.datacore', 'lib'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.datacore', 'lib', 'ledger_cli.py'),
      `import sys\nsys.exit(${exitCode})\n`,
    )
    fs.mkdirSync(path.join(dir, space, '.datacore', 'events'), { recursive: true })
  }

  it('reports pre-v2 installs as null, never as broken', () => {
    // An installation without a ledger needs an update, not an incident. If
    // this ever returns false, every pre-v2 machine reports a fault it
    // does not have — and the real ones stop standing out.
    const r = checkLedgerHealth(dir)
    expect(r.ok).toBeNull()
    expect(r.detail).toContain('pre-v2')
  }, SLOW)

  it('reports null when a ledger exists but no space carries events', () => {
    fs.mkdirSync(path.join(dir, '.datacore', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.datacore', 'lib', 'ledger_cli.py'), 'pass\n')
    const r = checkLedgerHealth(dir)
    expect(r.ok).toBeNull()
  }, SLOW)

  it('reports ok when every chain verifies', () => {
    withLedger(0)
    const r = checkLedgerHealth(dir)
    if (!r.python) return // no capable interpreter on this box
    expect(r.ok).toBe(true)
    expect(r.spaces_verified).toBe(1)
  }, SLOW)

  it('reports FALSE when a chain is broken', () => {
    withLedger(3, '1-datafund')
    const r = checkLedgerHealth(dir)
    if (!r.python) return
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('BROKEN')
  }, SLOW)

  it('never selects an interpreter that cannot load the ledger', () => {
    // The regression this exists for: `python3` on macOS is 3.9, which raises
    // TypeError on the ledger's PEP-604 annotations at import time — so
    // selecting by name reports a healthy ledger as unreadable.
    withLedger(0)
    const r = checkLedgerHealth(dir)
    if (!r.python) return
    const v = execFileSync(r.python, ['-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    }).trim()
    const parts = v.split('.').map(Number)
    const maj = parts[0]!
    const min = parts[1]!
    expect(maj > 3 || (maj === 3 && min >= 10)).toBe(true)
  }, SLOW)
})
