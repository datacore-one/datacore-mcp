import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getPlur, resetPlur } from '../src/plur-bridge.js'

describe('plur-bridge', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plur-bridge-'))
    process.env.PLUR_PATH = tmpDir
    resetPlur()
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
    resetPlur()
  })

  it('returns a Plur instance', () => {
    const plur = getPlur()
    expect(plur).toBeDefined()
    expect(typeof plur.learn).toBe('function')
    expect(typeof plur.recall).toBe('function')
    expect(typeof plur.inject).toBe('function')
    expect(typeof plur.feedback).toBe('function')
    expect(typeof plur.forget).toBe('function')
    expect(typeof plur.getById).toBe('function')
  })

  it('returns the same instance on repeated calls', () => {
    expect(getPlur()).toBe(getPlur())
  })

  it('resets the instance', () => {
    const a = getPlur()
    resetPlur()
    expect(getPlur()).not.toBe(a)
  })
})
