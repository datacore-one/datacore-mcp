// test/tools/command-steps.test.ts
// datacore_command_steps drives the same journal checklist as the shell tracker,
// so a client without any task tool still tracks every numbered step.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'
import type { StorageConfig } from '../../src/storage.js'
import { handleCommandSteps } from '../../src/tools/command-steps.js'
import { handleCommandRun } from '../../src/tools/commands.js'
import { findPython } from '../../src/runtime-python.js'

/** The installation's lib, found by walking up from this repo (it lives inside one). */
function findLib(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const lib = path.join(dir, '.datacore', 'lib')
    if (fs.existsSync(path.join(lib, 'command_steps.py'))) return lib
    dir = path.dirname(dir)
  }
  return null
}

const lib = findLib()
const available = !!lib && !!findPython()

describe.skipIf(!available)('datacore_command_steps', () => {
  let root: string
  let storage: StorageConfig
  const savedState = process.env.DATACORE_STATE

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'command-steps-')))
    fs.mkdirSync(path.join(root, '.datacore', 'commands'), { recursive: true })
    fs.symlinkSync(lib as string, path.join(root, '.datacore', 'lib'))
    fs.writeFileSync(path.join(root, '.datacore', 'commands', 'demo.md'),
      '---\nname: demo\n---\n\n# Demo\n\n## Step 1: First thing\n\n## Step 2: Second thing\n\n## Step 2b: Last thing\n')
    const space = path.join(root, '0-personal')
    fs.mkdirSync(path.join(space, '.datacore'), { recursive: true })
    fs.writeFileSync(path.join(space, '.datacore', 'config.yaml'), 'space:\n  name: personal\n')
    fs.mkdirSync(path.join(space, 'notes', 'journals'), { recursive: true })
    // Runtime state refuses aliased paths (macOS /var -> /private/var).
    process.env.DATACORE_STATE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'command-steps-state-')))
    storage = { basePath: root, mode: 'full' } as unknown as StorageConfig
  })

  afterAll(() => {
    if (savedState === undefined) delete process.env.DATACORE_STATE
    else process.env.DATACORE_STATE = savedState
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('starts, ticks, reports and resumes a run in the journal', async () => {
    const started = await handleCommandSteps({ op: 'start', command: 'demo', date: '2026-09-28' }, storage) as any
    expect(started.error).toBeUndefined()
    const runId = started.result.run_id as string
    const journal = path.join(root, '0-personal', 'notes', 'journals', '2026-09-28.md')
    expect(fs.readFileSync(journal, 'utf8')).toContain('- [ ] 2b. Last thing')

    const ticked = await handleCommandSteps({ op: 'tick', run_id: runId, steps: ['1'] }, storage) as any
    expect(ticked.result.done).toEqual(['1'])
    expect(fs.readFileSync(journal, 'utf8')).toMatch(/- \[x\] 1\. First thing — done \d\d:\d\d:\d\d/)

    const resumed = await handleCommandSteps({ op: 'resume', command: 'demo', date: '2026-09-28' }, storage) as any
    expect(resumed.result.run_id).toBe(runId)
    expect(resumed.result.pending).toEqual(['2', '2b'])

    await handleCommandSteps({ op: 'tick', run_id: runId, steps: ['2', '2b'], note: 'not-applicable (demo)' }, storage)
    const none = await handleCommandSteps({ op: 'resume', command: 'demo', date: '2026-09-28' }, storage) as any
    expect(none.result).toBeNull()
  })

  it('reports an unknown step or command as an error, not a crash', async () => {
    const bad = await handleCommandSteps({ op: 'start', command: 'nope' }, storage) as any
    expect(bad.error).toMatch(/Unknown command/)
    const started = await handleCommandSteps({ op: 'start', command: 'demo', date: '2026-09-28' }, storage) as any
    const tick = await handleCommandSteps({ op: 'tick', run_id: started.result.run_id, steps: ['99'] }, storage) as any
    expect(tick.error).toMatch(/no step 99/)
  })

  it('command_run points the client at the tracker', () => {
    const run = handleCommandRun({ command: 'demo' }, storage) as any
    expect(run._hints.related).toContain('datacore_command_steps')
  })
})
