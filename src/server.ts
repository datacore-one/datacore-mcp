// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { detectStorage, initStandalone, type StorageConfig } from './storage.js'
import { currentVersion, checkForUpdate } from './version.js'
import { TOOLS } from './tools/index.js'
import { handleCapture } from './tools/capture.js'
import { handleLearn } from './tools/learn.js'
import { handleInject } from './tools/inject-tool.js'
import { handleSearch } from './tools/search.js'
import { handleIngest } from './tools/ingest.js'
import { handleStatus } from './tools/status.js'
import { handleDiscover } from './tools/discover.js'
import { handleInstall } from './tools/install.js'

let storage: StorageConfig
let updateAvailable: string | null = null

export function createServer(): Server {
  const server = new Server(
    { name: 'datacore-mcp', version: currentVersion },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const result = await routeTool(name, args ?? {})
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true }
    }
  })

  return server
}

async function routeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const toolDef = TOOLS.find(t => t.name === name)
  if (!toolDef) throw new Error(`Unknown tool: ${name}`)
  const validated = toolDef.inputSchema.parse(args)

  switch (name) {
    case 'datacore.capture': return handleCapture(validated, storage)
    case 'datacore.learn': return handleLearn(validated, storage.engramsPath)
    case 'datacore.inject': return handleInject(validated, { engramsPath: storage.engramsPath, packsPath: storage.packsPath })
    case 'datacore.search': return handleSearch(validated, { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath })
    case 'datacore.ingest': return handleIngest(validated, { knowledgePath: storage.knowledgePath, engramsPath: storage.engramsPath })
    case 'datacore.status': return handleStatus({ ...storage, engramsPath: storage.engramsPath, packsPath: storage.packsPath }, updateAvailable)
    case 'datacore.discover': return handleDiscover(validated, storage.packsPath)
    case 'datacore.install': return handleInstall(validated, storage.packsPath)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

export async function runStdio(): Promise<void> {
  storage = detectStorage()
  if (storage.mode === 'standalone') {
    initStandalone(storage.basePath)
  }

  // Fire-and-forget update check
  checkForUpdate().then(v => { updateAvailable = v })

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
