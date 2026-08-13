// test/module-isolation.test.ts
/**
 * One malformed module must not be able to delete every other tool.
 *
 * On 2026-08-13 a module exporting a plain JSON Schema as `inputSchema` made
 * tools/list throw "Cannot read properties of undefined (reading 'typeName')".
 * The agent's symptom was not "that module is broken" — it was "Datacore has
 * no tools at all", and finding the cause needed a hand-written JSON-RPC probe
 * (datacore-mcp#15).
 *
 * Spawned as a real server over stdio, because that is the only place the bug
 * existed: the unit-level conversion was fine in isolation, and it was the
 * unguarded .map() inside the request handler that turned one bad tool into a
 * dead server.
 */

import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const distEntry = path.join(here, '..', 'dist', 'index.js')

function makeInstall(schemaLiteral: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-iso-'))
  const modDir = path.join(root, '.datacore', 'modules', 'badmod')
  fs.mkdirSync(path.join(modDir, 'tools'), { recursive: true })
  fs.writeFileSync(
    path.join(modDir, 'module.yaml'),
    'name: badmod\nversion: 0.1.0\ndescription: test module\n' +
      'provides:\n  tools:\n    - name: inventory\n      description: test tool\n',
  )
  fs.writeFileSync(
    path.join(modDir, 'tools', 'index.js'),
    `export const tools = [{\n` +
      `  name: 'inventory',\n` +
      `  description: 'test tool',\n` +
      `  inputSchema: ${schemaLiteral},\n` +
      `  handler: async () => ({ ok: true }),\n` +
      `}]\nexport default { tools }\n`,
  )
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true })
  return root
}

async function listTools(root: string): Promise<{ error?: string; names: string[] }> {
  return new Promise((resolve) => {
    const p = spawn('node', [distEntry], {
      env: { ...process.env, DATACORE_PATH: root, DATACORE_ROOT: root },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } },
      }) + '\n',
    )
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n')
    setTimeout(() => {
      p.kill()
      const line = out.trim().split('\n').filter((l) => l.includes('"id":2')).pop()
      if (!line) return resolve({ error: 'no response', names: [] })
      const r = JSON.parse(line)
      if (r.error) return resolve({ error: r.error.message, names: [] })
      resolve({ names: r.result.tools.map((t: { name: string }) => t.name) })
    }, 6000)
  })
}

describe('module tool isolation', () => {
  it('a plain JSON Schema module does not break discovery, and registers', async () => {
    const root = makeInstall(`{ type: 'object', properties: { skill: { type: 'string' } } }`)
    try {
      const r = await listTools(root)
      expect(r.error).toBeUndefined()
      expect(r.names).toContain('datacore_status')          // core tools survive
      expect(r.names).toContain('datacore_badmod_inventory') // and JSON Schema is accepted
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 30000)

  it('an unusable schema costs only its own tool', async () => {
    // Neither Zod nor JSON Schema. This one genuinely cannot be served — but
    // the blast radius must stop at that single tool.
    const root = makeInstall(`'not a schema at all'`)
    try {
      const r = await listTools(root)
      expect(r.error).toBeUndefined()
      expect(r.names).toContain('datacore_status')
      expect(r.names).not.toContain('datacore_badmod_inventory')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 30000)
})
