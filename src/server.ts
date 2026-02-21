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
import { handleExport } from './tools/export.js'
import {
  discoverModules,
  loadModuleTools,
  type DiscoveredModule,
  type RegisteredModuleTool,
} from './modules.js'
import { handleModulesList } from './tools/modules-list.js'
import { handleModulesInfo } from './tools/modules-info.js'
import { handleModulesHealth } from './tools/modules-health.js'
import { handleForget } from './tools/forget.js'
import { handleFeedback } from './tools/feedback.js'
import { logger } from './logger.js'
import { registerResources, notifyEngramsChanged } from './resources.js'
import { DatacortexBridge } from './datacortex.js'

let storage: StorageConfig
let updateAvailable: string | null = null
let moduleTools: RegisteredModuleTool[] = []
let discoveredModules: DiscoveredModule[] = []
let isFirstRun = false
let serverRef: Server | null = null
let datacortexBridge: DatacortexBridge | null = null

// --- Server creation ---

export function createServer(): Server {
  const server = new Server(
    { name: 'datacore-mcp', version: currentVersion },
    { capabilities: { tools: {}, logging: {}, resources: { subscribe: true } } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema),
      })),
      ...moduleTools.map(t => ({
        name: t.fullName,
        description: t.definition.description,
        inputSchema: zodToJsonSchema(t.definition.inputSchema),
      })),
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const result = await routeTool(name, args ?? {})
      const response: { type: string; text: string }[] = []
      if (isFirstRun) {
        isFirstRun = false
        response.push({ type: 'text', text: JSON.stringify({
          _welcome: `Welcome to Datacore MCP! Your data is stored at ${storage.basePath}. Try: datacore.learn to create your first engram, datacore.capture to write a journal entry, or datacore.status to see system info.`,
        }) })
      }
      response.push({ type: 'text', text: JSON.stringify(result, null, 2) })
      return { content: response }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true }
    }
  })

  logger.setServer(server)
  registerResources(server, storage)
  serverRef = server
  return server
}

// --- Tool routing ---

const ENGRAM_MUTATING_TOOLS = new Set(['datacore.learn', 'datacore.forget', 'datacore.feedback'])

async function routeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const coreTool = TOOLS.find(t => t.name === name)
  if (coreTool) {
    const validated = coreTool.inputSchema.parse(args)
    let result: unknown
    switch (name) {
      case 'datacore.capture': result = await handleCapture(validated, storage); break
      case 'datacore.learn': result = await handleLearn(validated, storage.engramsPath); break
      case 'datacore.inject': result = await handleInject(validated, { engramsPath: storage.engramsPath, packsPath: storage.packsPath }); break
      case 'datacore.search': result = await handleSearch(validated, { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath }, datacortexBridge); break
      case 'datacore.ingest': result = await handleIngest(validated, { knowledgePath: storage.knowledgePath, engramsPath: storage.engramsPath }); break
      case 'datacore.status': result = await handleStatus({ ...storage, engramsPath: storage.engramsPath, packsPath: storage.packsPath }, updateAvailable); break
      case 'datacore.forget': result = await handleForget(validated, storage.engramsPath); break
      case 'datacore.feedback': result = await handleFeedback(validated as { engram_id: string; signal: 'positive' | 'negative' | 'neutral'; comment?: string }, storage.engramsPath); break
      case 'datacore.packs.discover': result = handleDiscover(validated, storage.packsPath); break
      case 'datacore.packs.install': result = await handleInstall(validated, storage.packsPath); break
      case 'datacore.packs.export': result = await handleExport(validated as any, { engramsPath: storage.engramsPath, packsPath: storage.packsPath }); break
      case 'datacore.modules.list': result = await handleModulesList(validated, storage, discoveredModules); break
      case 'datacore.modules.info': result = await handleModulesInfo(validated as { module: string }, storage, discoveredModules); break
      case 'datacore.modules.health': result = await handleModulesHealth(validated as { module?: string }, storage, discoveredModules); break
      default: throw new Error(`Unknown core tool: ${name}`)
    }
    if (ENGRAM_MUTATING_TOOLS.has(name) && serverRef) {
      notifyEngramsChanged(serverRef)
    }
    return result
  }

  const modTool = moduleTools.find(t => t.fullName === name)
  if (modTool) {
    const validated = modTool.definition.inputSchema.parse(args)
    return modTool.definition.handler(validated, modTool.context)
  }

  const allNames = [...TOOLS.map(t => t.name), ...moduleTools.map(t => t.fullName)]
  const suggestions = findClosestTools(name, allNames)
  const hint = suggestions.length > 0
    ? ` Did you mean: ${suggestions.join(', ')}?`
    : ''
  throw new Error(`Unknown tool: ${name}.${hint}`)
}

// --- Tool name suggestion ---

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

export function findClosestTools(name: string, allNames: string[]): string[] {
  const threshold = Math.max(3, Math.floor(name.length * 0.35))
  const scored = allNames
    .map(t => ({ name: t, dist: levenshtein(name.toLowerCase(), t.toLowerCase()) }))
    .filter(s => s.dist <= threshold)
    .sort((a, b) => a.dist - b.dist)
  return scored.slice(0, 2).map(s => s.name)
}

// --- Shared initialization ---

async function initStorage(): Promise<void> {
  storage = detectStorage()
  if (storage.mode === 'standalone') {
    const result = initStandalone(storage.basePath)
    isFirstRun = result.isFirstRun
  }
  if (storage.mode === 'full') {
    discoveredModules = discoverModules(storage)
    moduleTools = await loadModuleTools(discoveredModules, storage)
    datacortexBridge = new DatacortexBridge(storage.basePath)
  }
}

// --- Transport entry points ---

export async function runStdio(): Promise<void> {
  await initStorage()

  checkForUpdate().then(v => { updateAvailable = v })
  const updateInterval = setInterval(() => {
    checkForUpdate().then(v => { updateAvailable = v })
  }, 3600_000)
  updateInterval.unref()

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)

  server.onclose = () => {
    clearInterval(updateInterval)
  }
}

export async function runHttp(): Promise<void> {
  const { createServer: createHttpServer } = await import('http')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')

  await initStorage()
  checkForUpdate().then(v => { updateAvailable = v })

  const port = parseInt(process.env.DATACORE_HTTP_PORT ?? '3100', 10)
  const host = process.env.DATACORE_HTTP_HOST ?? '127.0.0.1'
  const server = createServer()

  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', version: currentVersion }))
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  })

  httpServer.listen(port, host, () => {
    console.log(`Datacore MCP server listening on http://${host}:${port}/mcp`)
  })
}

// Export for testing
export { moduleTools as _moduleTools }
