// test/tool-profile.test.ts
/**
 * Cursor caps a workspace at ~40 MCP tools across every server; a full
 * Datacore install advertises 70+. DATACORE_TOOL_PROFILE=cursor (or lean)
 * advertises the core tools plus one dispatcher, datacore_call, that reaches
 * every module tool with the same validation as a direct call.
 */

import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const distEntry = path.join(here, '..', 'dist', 'index.js')

function makeInstall(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-profile-')))
  const modDir = path.join(root, '.datacore', 'modules', 'fixmod')
  fs.mkdirSync(path.join(modDir, 'tools'), { recursive: true })
  fs.writeFileSync(path.join(modDir, 'module.yaml'),
    'name: fixmod\nversion: 0.1.0\ndescription: test module\n' +
    'provides:\n  tools:\n    - name: echo\n      description: echo a word\n')
  fs.writeFileSync(path.join(modDir, 'tools', 'index.js'),
    `export const tools = [{\n` +
    `  name: 'echo',\n  description: 'echo a word',\n` +
    `  inputSchema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] },\n` +
    `  handler: async (args) => ({ echoed: args.word }),\n}]\nexport default { tools }\n`)
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true })
  fs.writeFileSync(path.join(root, '.datacore/config.yaml'), 'space: {name: personal, type: personal}\n')
  return root
}

type Rpc = (method: string, params?: Record<string, unknown>) => Promise<any>

async function withServer(root: string, profile: string | undefined, body: (rpc: Rpc) => Promise<void>) {
  const env: Record<string, string | undefined> = { ...process.env, DATACORE_PATH: root }
  if (profile === undefined) delete env.DATACORE_TOOL_PROFILE
  else env.DATACORE_TOOL_PROFILE = profile
  const p = spawn('node', [distEntry], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = ''
  const waiting = new Map<number, (v: any) => void>()
  p.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      try { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id) } catch { /* not JSON-RPC */ }
    }
  })
  let id = 0
  const rpc: Rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const my = ++id
    const t = setTimeout(() => reject(new Error(`timeout: ${method}`)), 20000)
    waiting.set(my, (m) => { clearTimeout(t); resolve(m) })
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: my, method, params }) + '\n')
  })
  try {
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } })
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    await body(rpc)
  } finally { p.kill() }
}

const text = (m: any) => JSON.parse(m.result.content[m.result.content.length - 1].text)

describe('tool profiles', () => {
  it('full (default) advertises module tools directly', async () => {
    const root = makeInstall()
    try {
      await withServer(root, undefined, async (rpc) => {
        const names = (await rpc('tools/list')).result.tools.map((t: any) => t.name)
        expect(names).toContain('datacore_fixmod_echo')
        expect(names).not.toContain('datacore_call')
      })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  }, 40000)

  it('cursor advertises core tools plus datacore_call, well under the cap', async () => {
    const root = makeInstall()
    try {
      await withServer(root, 'cursor', async (rpc) => {
        const names = (await rpc('tools/list')).result.tools.map((t: any) => t.name)
        expect(names).toContain('datacore_call')
        expect(names).toContain('datacore_status')
        expect(names).not.toContain('datacore_fixmod_echo')
        expect(names.length).toBeLessThanOrEqual(15)
      })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  }, 40000)

  it('datacore_call reaches a module tool and validates its arguments', async () => {
    const root = makeInstall()
    try {
      await withServer(root, 'cursor', async (rpc) => {
        const ok = await rpc('tools/call', { name: 'datacore_call', arguments: { tool: 'datacore_fixmod_echo', args: { word: 'hi' } } })
        expect(text(ok)).toEqual({ echoed: 'hi' })
        const bad = await rpc('tools/call', { name: 'datacore_call', arguments: { tool: 'datacore_fixmod_echo', args: {} } })
        expect(bad.result.isError).toBe(true)
      })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  }, 40000)

  it('datacore_call with no tool lists what it can reach, with schemas', async () => {
    const root = makeInstall()
    try {
      await withServer(root, 'cursor', async (rpc) => {
        const help = text(await rpc('tools/call', { name: 'datacore_call', arguments: {} }))
        const echo = help.tools.find((t: any) => t.name === 'datacore_fixmod_echo')
        expect(echo.description).toBe('echo a word')
        expect(echo.inputSchema.required).toEqual(['word'])
      })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  }, 40000)

  it('an unknown profile value falls back to full rather than hiding tools', async () => {
    const root = makeInstall()
    try {
      await withServer(root, 'bogus', async (rpc) => {
        const names = (await rpc('tools/list')).result.tools.map((t: any) => t.name)
        expect(names).toContain('datacore_fixmod_echo')
      })
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  }, 40000)
})
