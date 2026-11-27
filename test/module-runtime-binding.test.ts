// A module's `@datacore-one/mcp/runtime` import must bind to the runtime of the
// server that loads it -- never to whatever copy happens to sit on disk.
//
// 2026-11-27: on the owner's Mac the gtd module resolved the import to a stale
// npm copy (2.2.1, its own zod 4.6.5) while the server converted schemas with
// zod 4.4.3; the cross-version conversion crashed on add_task's record-with-
// pattern-key field and the server silently dropped add_task. On the agent host
// no copy existed at all, so no module tool loaded. These tests run the BUILT
// server as a child process: vitest's own resolver would mask Node's behaviour.
import { afterEach, beforeEach, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const SERVER = path.join(process.cwd(), 'dist', 'index.js')
let root: string

const TOOLS_JS = `
import { z } from '@datacore-one/mcp/runtime'
export const tools = [{
  name: 'add_item',
  description: 'Add an item with optional uppercase-keyed properties',
  inputSchema: z.object({
    title: z.string(),
    properties: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string()).optional(),
  }),
  handler: async (args) => ({ ok: true, title: args.title, keys: Object.keys(args.properties || {}) }),
}]
`

function writeInstall(): void {
  fs.mkdirSync(path.join(root, '0-personal', 'org'), { recursive: true })
  fs.mkdirSync(path.join(root, '0-personal', '.datacore'), { recursive: true })
  fs.writeFileSync(path.join(root, '0-personal', '.datacore', 'config.yaml'),
    'space:\n  name: personal\n  type: personal\n')
  // Space discovery belongs to the installation's Python library; stub its answer.
  const library = path.join(root, '.datacore', 'lib')
  fs.mkdirSync(library, { recursive: true })
  const catalog = { version: 1, spaces: [{ name: 'personal', type: 'personal', marked: true, path: '0-personal' }] }
  fs.writeFileSync(path.join(library, 'space_catalog.py'), `print(${JSON.stringify(JSON.stringify(catalog))})`)
  const mod = path.join(root, '.datacore', 'modules', 'probe')
  fs.mkdirSync(path.join(mod, 'tools'), { recursive: true })
  fs.writeFileSync(path.join(mod, 'module.yaml'),
    'name: probe\nversion: 1.0.0\nprovides:\n  tools:\n    - name: add_item\n      description: Add an item\n')
  fs.writeFileSync(path.join(mod, 'tools', 'index.js'), TOOLS_JS)
}

function writeStaleCopy(): void {
  // A decoy older install the module would find by Node's directory walk.
  const pkg = path.join(root, '.datacore', 'modules', 'node_modules', '@datacore-one', 'mcp')
  fs.mkdirSync(pkg, { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({
    name: '@datacore-one/mcp', version: '0.0.1-stale', type: 'module',
    exports: { './runtime': './runtime.js' },
  }))
  fs.writeFileSync(path.join(pkg, 'runtime.js'), 'export const z = undefined\nexport const STALE = true\n')
}

async function withServer<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  env.DATACORE_PATH = root
  env.HOME = root
  delete env.DATACORE_TOOL_PROFILE
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env, cwd: root, stderr: 'pipe' })
  const client = new Client({ name: 'runtime-binding-test', version: '0' })
  await client.connect(transport)
  try { return await fn(client) } finally { await client.close() }
}

async function probe(client: Client) {
  const { tools } = await client.listTools()
  const names = tools.map(t => t.name)
  const health = await client.callTool({ name: 'datacore_modules_health', arguments: { module: 'probe' } })
  return { names, health: (health.content as Array<{ text: string }>)[0].text }
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-runtime-binding-')))
  writeInstall()
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

it('loads a module tool that imports the runtime when no copy is installed on disk', async () => {
  const { names, health } = await withServer(probe)
  expect(names, health).toContain('datacore_probe_add_item')
}, 30000)

it('binds the runtime import to the loading server, not a stale copy on disk', async () => {
  writeStaleCopy()
  await withServer(async (client) => {
    const { names, health } = await probe(client)
    expect(names, health).toContain('datacore_probe_add_item')
    const res = await client.callTool({ name: 'datacore_probe_add_item',
      arguments: { title: 'x', properties: { DONE_WHEN: 'tests pass' } } })
    const text = (res.content as Array<{ text: string }>)[0].text
    expect(text).toContain('DONE_WHEN')
  })
}, 30000)
