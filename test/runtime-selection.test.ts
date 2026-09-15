import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { detectStorage, initCore } from '../src/storage.js'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-selection-'))
  vi.stubEnv('HOME', root)
  vi.stubEnv('DATACORE_PATH', undefined)
  vi.stubEnv('DATACORE_CORE_PATH', undefined)
  fs.mkdirSync(path.join(root, 'Data', '.datacore'), { recursive: true })
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })

describe('explicit storage identity never falls back to another store', () => {
  it('rejects a missing explicit full installation', () => {
    vi.stubEnv('DATACORE_PATH', path.join(root, 'missing'))
    expect(() => detectStorage()).toThrow()
  })
  it('initializes only a newly selected core directory without falling back', () => {
    const selected = path.join(root, 'new-core')
    vi.stubEnv('DATACORE_CORE_PATH', selected)
    const result = detectStorage()
    expect(result.mode).toBe('core')
    expect(result.basePath).toBe(selected)
    initCore(result.basePath)
    expect(fs.existsSync(path.join(selected, 'engrams.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'Data', 'engrams.yaml'))).toBe(false)
  })
  it.each(['DATACORE_PATH', 'DATACORE_CORE_PATH'])('%s rejects an empty override', (key) => {
    vi.stubEnv(key, '')
    expect(() => detectStorage()).toThrow()
  })
  it.each(['DATACORE_PATH', 'DATACORE_CORE_PATH'])('%s rejects a relative path', (key) => {
    vi.stubEnv(key, '.')
    expect(() => detectStorage()).toThrow()
  })
  it('refuses two explicit store modes', () => {
    const core = path.join(root, 'Core'); fs.mkdirSync(core)
    vi.stubEnv('DATACORE_PATH', path.join(root, 'Data'))
    vi.stubEnv('DATACORE_CORE_PATH', core)
    expect(() => detectStorage()).toThrow()
  })
  it('rejects a metadata file masquerading as an installation directory', () => {
    const data = path.join(root, 'file-metadata'); fs.mkdirSync(data)
    fs.writeFileSync(path.join(data, '.datacore'), 'not a directory')
    vi.stubEnv('DATACORE_PATH', data)
    expect(() => detectStorage()).toThrow()
  })
})
