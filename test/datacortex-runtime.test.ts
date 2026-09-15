import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { DatacortexBridge } from '../src/datacortex.js'
import { resetPythonCache } from '../src/runtime-python.js'
import { logger } from '../src/logger.js'

let root: string
let script: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-bridge-'))
  const executable = execFileSync('python3', ['-I', '-c', 'import sys;print(sys.executable)'], { encoding:'utf8' }).trim()
  const selected = path.join(root, 'python with spaces')
  fs.symlinkSync(executable, selected)
  vi.stubEnv('DATACORE_PYTHON', selected)
  vi.stubEnv('DATACORE_LIB', undefined)
  script = path.join(root, '.datacore/modules/datacortex/lib/bridge.py')
  fs.mkdirSync(path.dirname(script), { recursive:true })
  fs.writeFileSync(script, 'import json\nprint(json.dumps({"results":[]}))\n')
  resetPythonCache()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); resetPythonCache(); fs.rmSync(root, { recursive:true, force:true }) })

it('uses an installed interpreter path as one argument without a shell', async () => {
  const bridge = new DatacortexBridge(root)
  expect(bridge.isAvailable().available).toBe(true)
  expect(await bridge.search('synthetic')).toEqual({results:[]})
})

it('cannot substitute data-checkout code for a missing explicit installed bridge', () => {
  vi.stubEnv('DATACORE_LIB', path.join(root, 'missing/lib'))
  expect(new DatacortexBridge(root).isAvailable().available).toBe(false)
})

it.each(['{"results":"wrong"}', '{"results":[null]}', '{"results":[{"path":"x","score":1}]}'])('rejects malformed dependency result %s', async raw => {
  fs.writeFileSync(script, `print(${JSON.stringify(raw)})\n`)
  expect(await new DatacortexBridge(root).search('synthetic')).toEqual({results:[],fallback:true})
})

it('does not put provider diagnostics into logs', async () => {
  fs.writeFileSync(script, 'import json\nprint(json.dumps({"error":"SYNTHETIC_PRIVATE_VALUE"}))\n')
  const spy = vi.spyOn(logger,'warning').mockImplementation(() => {})
  expect((await new DatacortexBridge(root).search('synthetic')).fallback).toBe(true)
  expect(JSON.stringify(spy.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_VALUE')
})

it('does not put failed process stderr into logs', async () => {
  fs.writeFileSync(script, 'import sys\nprint("SYNTHETIC_PRIVATE_STDERR",file=sys.stderr)\nsys.exit(7)\n')
  const spy = vi.spyOn(logger,'warning').mockImplementation(() => {})
  expect((await new DatacortexBridge(root).search('synthetic')).fallback).toBe(true)
  expect(JSON.stringify(spy.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_STDERR')
})

it('bounds valid returned results to the requested limit', async () => {
  fs.writeFileSync(script, 'import json\nprint(json.dumps({"results":[{"path":"x","score":0.5,"snippet":"Synthetic"}]*3}))\n')
  const result = await new DatacortexBridge(root).search('synthetic',1)
  expect(result.results).toHaveLength(1)
  expect(result.fallback).toBeUndefined()
})

it('does not leave an exited bridge leader\'s foreground child running', async () => {
  const late = path.join(root,'late-write')
  const child = `import signal,time\nfrom pathlib import Path\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\nprint('ready',flush=True)\ntime.sleep(0.6)\nPath(${JSON.stringify(late)}).write_text('must not happen')\n`
  fs.writeFileSync(script, `import subprocess,sys,json\np=subprocess.Popen([sys.executable,'-c',${JSON.stringify(child)}],stdout=subprocess.PIPE,text=True)\np.stdout.readline()\nprint(json.dumps({"results":[]}))\n`)
  expect(await new DatacortexBridge(root).search('synthetic')).toEqual({results:[]})
  await new Promise(resolve => setTimeout(resolve,800))
  expect(fs.existsSync(late)).toBe(false)
})

it('does not execute ambient Python startup code while probing or searching', async () => {
  const injected = path.join(root, 'injected');fs.mkdirSync(injected)
  const marker = path.join(root, 'startup-ran')
  fs.writeFileSync(path.join(injected, 'sitecustomize.py'), `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text('not authorized')\n`)
  vi.stubEnv('PYTHONPATH', injected)
  const bridge = new DatacortexBridge(root)
  expect(bridge.isAvailable().available).toBe(true)
  expect(await bridge.search('synthetic')).toEqual({results:[]})
  expect(fs.existsSync(marker)).toBe(false)
})
