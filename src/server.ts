// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
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
      inputSchema: { type: 'object' as const, properties: {} },  // Simplified for SDK
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

// Args come as Record<string, unknown> from the MCP SDK. Each handler validates its own shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK provides untyped args
type ToolArgs = any

async function routeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const a = args as ToolArgs
  switch (name) {
    case 'datacore.capture': return handleCapture(a, storage)
    case 'datacore.learn': return handleLearn(a, storage.engramsPath)
    case 'datacore.inject': return handleInject(a, { engramsPath: storage.engramsPath, packsPath: storage.packsPath })
    case 'datacore.search': return handleSearch(a, { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath })
    case 'datacore.ingest': return handleIngest(a, { knowledgePath: storage.knowledgePath, engramsPath: storage.engramsPath })
    case 'datacore.status': return handleStatus({ ...storage, engramsPath: storage.engramsPath, packsPath: storage.packsPath }, updateAvailable)
    case 'datacore.discover': return handleDiscover(a, storage.packsPath)
    case 'datacore.install': return handleInstall(a, storage.packsPath)
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
