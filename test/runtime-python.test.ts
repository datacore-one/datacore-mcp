import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { findPython, resetPythonCache } from '../src/runtime-python.js'

let dir: string
function fakePython(file: string, version: string, hasYaml: boolean) {
  // Called as: <bin> -I -c <code>. $3 is the probe code.
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `#!/bin/sh\ncase "$3" in *yaml*) ${hasYaml ? '' : 'exit 1;;'} esac\necho ${version}\n`)
  fs.chmodSync(file, 0o755)
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-python-'))
  resetPythonCache()
  vi.stubEnv('DATACORE_PYTHON', undefined)
})
afterEach(() => { vi.unstubAllEnvs(); resetPythonCache(); fs.rmSync(dir, { recursive: true, force: true }) })

describe('findPython', () => {
  it('skips an interpreter that cannot import yaml', () => {
    fakePython(path.join(dir, 'bin', 'python3.13'), '3.13', false)
    fakePython(path.join(dir, 'bin', 'python3.12'), '3.12', true)
    vi.stubEnv('PATH', path.join(dir, 'bin'))
    expect(findPython()).toBe('python3.12')
  })
  it("prefers the installation's own venv", () => {
    const venvPy = path.join(dir, 'Data', '.datacore', 'venv', 'bin', 'python')
    fakePython(venvPy, '3.12', true)
    fakePython(path.join(dir, 'bin', 'python3.13'), '3.13', true)
    vi.stubEnv('PATH', path.join(dir, 'bin'))
    expect(findPython(path.join(dir, 'Data'))).toBe(venvPy)
  })
  it('an explicit DATACORE_PYTHON without yaml is refused, never replaced', () => {
    const bad = path.join(dir, 'bad', 'python')
    fakePython(bad, '3.12', false)
    fakePython(path.join(dir, 'bin', 'python3.12'), '3.12', true)
    vi.stubEnv('PATH', path.join(dir, 'bin'))
    vi.stubEnv('DATACORE_PYTHON', bad)
    expect(findPython()).toBeNull()
  })
})
