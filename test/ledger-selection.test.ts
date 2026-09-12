import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
const probe = vi.hoisted(() => vi.fn())
vi.mock('child_process', () => ({ execFileSync: probe }))
import { checkLedgerHealth, resetPythonCache } from '../src/ledger.js'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-ledger-selection-'))
  fs.mkdirSync(path.join(root, '.datacore/lib'), { recursive: true })
  fs.writeFileSync(path.join(root, '.datacore/lib/ledger_health.py'), 'pass\n')
  fs.mkdirSync(path.join(root, '0-fixture/.datacore/events'), { recursive: true })
  vi.stubEnv('DATACORE_PYTHON', undefined)
  vi.stubEnv('DATACORE_LIB', undefined)
  resetPythonCache(); probe.mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })

describe('runtime health cannot manufacture verification', () => {
  it('does not fall back after an invalid explicit interpreter', () => {
    vi.stubEnv('DATACORE_PYTHON', '/missing/selected-python')
    probe.mockImplementation((bin: string, args: string[]) => {
      if (bin === '/missing/selected-python') throw new Error('synthetic unavailable')
      return args.includes('-c') ? '3.11' : JSON.stringify({version:1,ok:true,spaces_verified:1,spaces_broken:0,spaces_unverified:0})
    })
    expect(checkLedgerHealth(root).ok).toBeNull()
    expect(probe.mock.calls.every(call => call[0] === '/missing/selected-python')).toBe(true)
  })
  it('does not report success when one space could not be verified', () => {
    fs.mkdirSync(path.join(root, '1-second/.datacore/events'), { recursive: true })
    probe.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('-c')) return '3.11'
      return JSON.stringify({version:1,ok:null,spaces_verified:1,spaces_broken:0,spaces_unverified:1})
    })
    expect(checkLedgerHealth(root).ok).toBeNull()
  })
  it('does not borrow helper code when the explicit installation is unavailable', () => {
    vi.stubEnv('DATACORE_LIB', path.join(root, 'missing-installed-code'))
    probe.mockImplementation((_bin: string, args: string[]) => args.includes('-c') ? '3.11' : JSON.stringify({version:1,ok:true,spaces_verified:2,spaces_broken:0,spaces_unverified:0}))
    expect(checkLedgerHealth(root).ok).toBeNull()
    expect(probe).not.toHaveBeenCalled()
  })
  it('uses the canonical helper count instead of rediscovering spaces', () => {
    fs.mkdirSync(path.join(root, '12-secondary/.datacore/events'), { recursive: true })
    probe.mockImplementation((_bin: string, args: string[]) => args.includes('-c') ? '3.11' : JSON.stringify({version:1,ok:true,spaces_verified:2,spaces_broken:0,spaces_unverified:0}))
    expect(checkLedgerHealth(root).spaces_verified).toBe(2)
  })
  it.each([
    {version:1,ok:true,spaces_verified:1,spaces_broken:0,spaces_unverified:1},
    {version:1,ok:true,spaces_verified:0,spaces_broken:0,spaces_unverified:0},
    {version:1,ok:true,spaces_verified:-1,spaces_broken:0,spaces_unverified:0},
    {version:1,ok:'true',spaces_verified:1,spaces_broken:0,spaces_unverified:0},
    {version:2,ok:true,spaces_verified:1,spaces_broken:0,spaces_unverified:0},
  ])('does not accept malformed or incomplete positive evidence: %j', (result) => {
    probe.mockImplementation((_bin: string, args: string[]) => args.includes('-c') ? '3.11' : JSON.stringify(result))
    expect(checkLedgerHealth(root).ok).toBeNull()
  })
  it('reports process failure as unverified without copying provider diagnostics', () => {
    probe.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('-c')) return '3.11'
      throw new Error('PRIVATE PROVIDER OUTPUT')
    })
    const result = checkLedgerHealth(root)
    expect(result.ok).toBeNull()
    expect(JSON.stringify(result)).not.toContain('PRIVATE PROVIDER')
  })
})
