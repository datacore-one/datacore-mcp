// A semantic search that could not run says so, and says why, in the result.
// Canvas finding (2026-10-01): the bridge script did not exist, so every
// method:"semantic" call quietly returned keyword results under a generic
// "unavailable" line that named no cause and no remedy.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { DatacortexBridge } from '../src/datacortex.js'
import { handleSearch } from '../src/tools/search.js'
import { resetPythonCache } from '../src/runtime-python.js'

let root: string
let script: string
const paths = { journalPath: null, knowledgePath: null }

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-semantic-'))
  const executable = execFileSync('python3', ['-I', '-c', 'import sys;print(sys.executable)'], { encoding: 'utf8' }).trim()
  vi.stubEnv('DATACORE_PYTHON', executable)
  vi.stubEnv('DATACORE_LIB', undefined)
  script = path.join(root, '.datacore/modules/datacortex/lib/bridge.py')
  resetPythonCache()
})
afterEach(() => { vi.unstubAllEnvs(); resetPythonCache(); fs.rmSync(root, { recursive: true, force: true }) })

function bridgeSays(code: string): DatacortexBridge {
  fs.mkdirSync(path.dirname(script), { recursive: true })
  fs.writeFileSync(script, code)
  return new DatacortexBridge(root)
}

it('names a missing bridge as the reason semantic search did not run', async () => {
  const out = await handleSearch({ query: 'anything', method: 'semantic' }, paths, new DatacortexBridge(root))
  expect(out.method).toBe('keyword')
  expect(out.fallback_warning).toMatch(/Semantic search did not run/)
  expect(out.fallback_warning).toMatch(/bridge is not installed/)
})

it('names a missing semantic index as the reason', async () => {
  const bridge = bridgeSays('import json\nprint(json.dumps({"error":"x","code":"no_index"}))\n')
  const out = await handleSearch({ query: 'anything', method: 'semantic' }, paths, bridge)
  expect(out.method).toBe('keyword')
  expect(out.fallback_warning).toMatch(/Semantic search did not run/)
  expect(out.fallback_warning).toMatch(/no semantic index/)
})

it('names a missing embedding model as the reason', async () => {
  const bridge = bridgeSays('import json\nprint(json.dumps({"error":"x","code":"no_model"}))\n')
  const out = await handleSearch({ query: 'anything', method: 'semantic' }, paths, bridge)
  expect(out.fallback_warning).toMatch(/embedding model/)
})

it('never passes the bridge\'s own error text through', async () => {
  const bridge = bridgeSays('import json\nprint(json.dumps({"error":"SYNTHETIC_PRIVATE_VALUE","code":"SYNTHETIC_CODE"}))\n')
  const out = await handleSearch({ query: 'anything', method: 'semantic' }, paths, bridge)
  expect(out.fallback_warning).toMatch(/Semantic search did not run/)
  expect(JSON.stringify(out)).not.toContain('SYNTHETIC_PRIVATE_VALUE')
  expect(JSON.stringify(out)).not.toContain('SYNTHETIC_CODE')
})

it('returns semantic results, marked semantic, when the bridge answers', async () => {
  const bridge = bridgeSays('import json\nprint(json.dumps({"results":[{"path":"a.md","score":0.9,"snippet":"s"}]}))\n')
  const out = await handleSearch({ query: 'anything', method: 'semantic' }, paths, bridge)
  expect(out.method).toBe('semantic')
  expect(out.fallback_warning).toBeUndefined()
  expect(out.results).toHaveLength(1)
})

it('says the bridge did not finish when it crashes or runs out of time', async () => {
  const bridge = bridgeSays('import sys\nsys.exit(7)\n')
  const out = await handleSearch({ query: 'anything', method: 'semantic' }, paths, bridge)
  expect(out.fallback_warning).toMatch(/did not finish/)
})
