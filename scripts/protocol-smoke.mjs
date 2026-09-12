// Exercise the built product in disposable storage, never an operator's data.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = await mkdtemp(path.join(tmpdir(), 'datacore-protocol-'))
const client = new Client({ name: 'datacore-verification', version: '1' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
  env: { PATH: process.env.PATH ?? '', HOME: root,
    DATACORE_PATH: root, DATACORE_ROOT: root },
  stderr: 'pipe',
})
let deadline
try {
  await mkdir(path.join(root, '.datacore'), { recursive: true })
  const scopes = ['', '0-personal', '1-team']
  for (const scope of scopes) {
    const modulePath = path.join(root, scope, '.datacore/modules/fixture')
    await mkdir(path.join(modulePath, 'tools'), { recursive: true })
    await writeFile(path.join(modulePath, 'module.yaml'),
      'name: fixture\nprovides:\n  tools:\n    - name: identify\n')
    await writeFile(path.join(modulePath, 'tools/index.js'),
      'export const tools = [{name:"identify",description:"fixture",' +
      'inputSchema:{type:"object",properties:{}},' +
      'handler:async (_,ctx)=>({space:ctx.spaceName??"global",dataPath:ctx.dataPath})}];')
  }
  await Promise.race([
    (async () => {
      await client.connect(transport)
      const result = await client.listTools()
      assert(result.tools.some(tool => tool.name === 'datacore_status'))
      assert.equal(new Set(result.tools.map(tool => tool.name)).size, result.tools.length)
      assert(result.tools.every(tool => /^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)))
      const status = await client.callTool({ name: 'datacore_status', arguments: {} })
      assert.notEqual(status.isError, true)
      for (const scope of scopes) {
        const name = `datacore_${scope ? scope + '_' : ''}fixture_identify`
        assert(result.tools.some(tool => tool.name === name))
        const response = await client.callTool({ name, arguments: {} })
        assert.notEqual(response.isError, true)
        const actual = JSON.parse(response.content.at(-1).text)
        assert.equal(actual.space, scope || 'global')
        assert.equal(actual.dataPath, path.join(root, scope || '0-personal', '.datacore/modules/fixture/data'))
      }
      console.log(`initialize, tools/list (${result.tools.length} tools), status and three scoped calls passed`)
    })(),
    new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('protocol deadline exceeded')), 15000) }),
  ])
} finally {
  clearTimeout(deadline)
  await transport.close()
  await rm(root, { recursive: true, force: true })
}
