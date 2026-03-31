// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { detectStorage, initCore, type StorageConfig } from './storage.js'
import { loadConfig } from './config.js'
import { currentVersion, checkForUpdate } from './version.js'
import { TOOLS } from './tools/index.js'
import { handleCapture } from './tools/capture.js'
import { handleSearch } from './tools/search.js'
import { handleIngest } from './tools/ingest.js'
import { handleStatus } from './tools/status.js'
import {
  discoverModules,
  loadModuleTools,
  type DiscoveredModule,
  type RegisteredModuleTool,
} from './modules.js'
import { handleModulesList } from './tools/modules-list.js'
import { handleModulesInfo } from './tools/modules-info.js'
import { handleModulesHealth } from './tools/modules-health.js'
import { logger } from './logger.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'
import { DatacortexBridge } from './datacortex.js'
import { SessionLogger } from './bench/session-logger.js'

let storage: StorageConfig
let updateAvailable: string | null = null
let moduleTools: RegisteredModuleTool[] = []
let discoveredModules: DiscoveredModule[] = []
let isFirstRun = false
let serverRef: Server | null = null
let datacortexBridge: DatacortexBridge | null = null
export let benchLogger: SessionLogger | null = null

// --- Server creation ---

export function createServer(): Server {
  const server = new Server(
    { name: 'datacore-mcp', version: currentVersion },
    {
      capabilities: { tools: {}, logging: {}, resources: { subscribe: true }, prompts: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  )

  // Initialize bench logger for session instrumentation (DIP-0025)
  if (storage) {
    const benchLogDir = storage.statePath
      ? `${storage.statePath}/bench`
      : `${storage.basePath}/.datacore/state/bench`
    benchLogger = new SessionLogger(benchLogDir, currentVersion)
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Hide modules.* tools in core mode — they require a full installation
    const coreTools = storage.mode === 'core'
      ? TOOLS.filter(t => !t.name.startsWith('datacore.modules.'))
      : TOOLS
    return {
      tools: [
        ...coreTools.map(t => ({
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
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const result = await routeTool(name, args ?? {})
      const response: { type: string; text: string }[] = []
      if (isFirstRun) {
        isFirstRun = false
        response.push({ type: 'text', text: JSON.stringify({
          _welcome: `Welcome to Datacore MCP! Your data is stored at ${storage.basePath}. Try: datacore.capture to write a journal entry, datacore.search to find information, or datacore.status to see system info.`,
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
  registerPrompts(server)
  serverRef = server
  return server
}

// --- Tool routing ---

async function routeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const callStart = Date.now()
  let callSuccess = true
  let callError: string | undefined
  let callResult: unknown

  try {
    callResult = await routeToolInner(name, args)
    return callResult
  } catch (e) {
    callSuccess = false
    callError = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    if (benchLogger) {
      benchLogger.logToolCall(name, args, callResult, Date.now() - callStart, callSuccess, callError)
    }
  }
}

async function routeToolInner(name: string, args: Record<string, unknown>): Promise<unknown> {
  const coreTool = TOOLS.find(t => t.name === name)
  if (coreTool) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod validates at runtime; union type too wide for TS
    const validated: any = coreTool.inputSchema.parse(args)
    let result: unknown
    switch (name) {
      case 'datacore.capture': result = await handleCapture(validated, storage); break
      case 'datacore.search': result = await handleSearch(validated, { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath, spaces: storage.spaces }, datacortexBridge); break
      case 'datacore.ingest': result = await handleIngest(validated, { knowledgePath: storage.knowledgePath }); break
      case 'datacore.status': result = await handleStatus({ journalPath: storage.journalPath, knowledgePath: storage.knowledgePath, packsPath: storage.packsPath, mode: storage.mode, basePath: storage.basePath }, updateAvailable); break
      case 'datacore.modules.list': result = await handleModulesList(validated, storage, discoveredModules); break
      case 'datacore.modules.info': result = await handleModulesInfo(validated as { module: string }, storage, discoveredModules); break
      case 'datacore.modules.health': result = await handleModulesHealth(validated as { module?: string }, storage, discoveredModules); break
      default: throw new Error(`Unknown core tool: ${name}`)
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
  if (storage.mode === 'core') {
    const result = initCore(storage.basePath)
    isFirstRun = result.isFirstRun
  }
  loadConfig(storage.basePath, storage.mode)
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
  // Check daily — MCP servers can run for months
  const updateInterval = setInterval(() => {
    checkForUpdate().then(v => { updateAvailable = v })
  }, 24 * 3600_000)
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

// --- Server instructions ---
// Included in the MCP initialize response. Compliant clients (Claude Desktop,
// Claude Code, Cursor, etc.) add this to the AI's system prompt so it uses
// Datacore proactively without needing a separate CLAUDE.md or config file.

const SERVER_INSTRUCTIONS = `Datacore is your productivity system — GTD task management, journal entries, knowledge files, and module management.

Use Datacore for:
- datacore.capture — write journal entries and knowledge notes
- datacore.search — find information in journal and knowledge files
- datacore.ingest — import content into your knowledge base
- datacore.status — check system health
- datacore.modules.* — manage installed modules

For memory (engrams, learning, recall): use PLUR MCP tools (plur_session_start, plur_learn, plur_recall, etc.)`

// Export for testing
export { moduleTools as _moduleTools }
