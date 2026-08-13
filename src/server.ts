// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { toJsonSchema, validateArgs } from './schema.js'
import { detectStorage, initCore, type StorageConfig } from './storage.js'
import { loadConfig } from './config.js'
import { currentVersion, checkForUpdate } from './version.js'
import { TOOLS } from './tools/index.js'
import { handleCapture } from './tools/capture.js'
import { handleSearch } from './tools/search.js'
import { handleIngest } from './tools/ingest.js'
import { handleStatus } from './tools/status.js'
import { handleDate } from './tools/date.js'
import {
  discoverModules,
  loadModuleTools,
  type DiscoveredModule,
  type RegisteredModuleTool,
} from './modules.js'
import { handleModulesList } from './tools/modules-list.js'
import { handleModulesInfo } from './tools/modules-info.js'
import { handleModulesHealth } from './tools/modules-health.js'
import {
  handleCommandList,
  handleCommandRun,
  handleAgentList,
  handleAgentRun,
} from './tools/commands.js'
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
    // Hide modules.* and command/agent tools in core mode — they require a full installation
    const coreTools = storage.mode === 'core'
      ? TOOLS.filter(t => !t.name.startsWith('datacore_modules_') && !t.name.startsWith('datacore_command_') && !t.name.startsWith('datacore_agent_'))
      : TOOLS
    return {
      tools: [
        ...coreTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: zodToJsonSchema(t.inputSchema),
        })),
        // Per-tool isolation. One module with an unusable schema must not be
        // able to delete every other tool from the server — which is exactly
        // what happened on 2026-08-13, when a single module left the agent
        // with no Datacore tools at all (datacore-mcp#15).
        ...moduleTools.flatMap(t => {
          try {
            return [{
              name: t.fullName,
              description: t.definition.description,
              inputSchema: toJsonSchema(t.definition.inputSchema),
            }]
          } catch (err) {
            // stderr, never stdout: stdout carries the JSON-RPC stream and
            // anything written there corrupts the protocol itself.
            console.error(
              `[datacore] skipping tool '${t.fullName}': ` +
              `${err instanceof Error ? err.message : String(err)}`,
            )
            return []
          }
        }),
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
          _welcome: `Welcome to Datacore MCP! Your data is stored at ${storage.basePath}. Try: datacore_capture to write a journal entry, datacore_search to find information, or datacore_status to see system info.`,
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

/**
 * Canonicalize an incoming tool name to its advertised form.
 *
 * Tool names are advertised with underscores (e.g. `datacore_capture`) because
 * MCP clients such as Claude Desktop validate every tool name in `tools/list`
 * against `^[a-zA-Z0-9_-]{1,64}$` and hard-reject dots. Older callers (and our
 * own pre-1.6 docs) used dot-namespaced names like `datacore.capture` or
 * `datacore.gtd.add_task`; we still accept those by mapping dots to underscores.
 * No advertised name contains a dot, so this transform is unambiguous.
 */
export function canonicalToolName(name: string): string {
  return name.includes('.') ? name.replace(/\./g, '_') : name
}

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
  // Accept legacy dot-namespaced names; route by the advertised underscore form.
  const lookupName = canonicalToolName(name)
  const coreTool = TOOLS.find(t => t.name === lookupName)
  if (coreTool) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod validates at runtime; union type too wide for TS
    const validated: any = coreTool.inputSchema.parse(args)
    let result: unknown
    switch (lookupName) {
      case 'datacore_capture': result = await handleCapture(validated, storage); break
      case 'datacore_search': result = await handleSearch(validated, { journalPath: storage.journalPath, knowledgePath: storage.knowledgePath, spaces: storage.spaces }, datacortexBridge); break
      case 'datacore_ingest': result = await handleIngest(validated, { knowledgePath: storage.knowledgePath }); break
      case 'datacore_status': result = await handleStatus({ journalPath: storage.journalPath, knowledgePath: storage.knowledgePath, packsPath: storage.packsPath, mode: storage.mode, basePath: storage.basePath }, updateAvailable); break
      case 'datacore_date': result = await handleDate(validated, storage.basePath); break
      case 'datacore_modules_list': result = await handleModulesList(validated, storage, discoveredModules); break
      case 'datacore_modules_info': result = await handleModulesInfo(validated as { module: string }, storage, discoveredModules); break
      case 'datacore_modules_health': result = await handleModulesHealth(validated as { module?: string }, storage, discoveredModules); break
      case 'datacore_command_list': result = handleCommandList(validated, storage); break
      case 'datacore_command_run': result = handleCommandRun(validated as { command: string }, storage); break
      case 'datacore_agent_list': result = handleAgentList(validated, storage); break
      case 'datacore_agent_run': result = handleAgentRun(validated as { agent: string }, storage); break
      default: throw new Error(`Unknown core tool: ${name}`)
    }
    return result
  }

  const modTool = moduleTools.find(t => t.fullName === lookupName)
  if (modTool) {
    const validated = validateArgs(modTool.definition.inputSchema, args)
    return modTool.definition.handler(validated, modTool.context)
  }

  const allNames = [...TOOLS.map(t => t.name), ...moduleTools.map(t => t.fullName)]
  const suggestions = findClosestTools(lookupName, allNames)
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

const SERVER_INSTRUCTIONS = `Datacore is your productivity system — GTD task management, journal entries, knowledge files, module management, commands, and agents.

Use Datacore for:
- datacore_capture — write journal entries and knowledge notes
- datacore_search — find information in journal and knowledge files
- datacore_ingest — import content into your knowledge base
- datacore_status — check system health
- datacore_modules_* — manage installed modules
- datacore_command_list — list available slash commands (/today, /tomorrow, /wrap-up, etc.)
- datacore_command_run — load a command's full instructions to execute
- datacore_agent_list — list available agents (specialized AI prompt templates)
- datacore_agent_run — load an agent's full prompt for task routing

When the user types a slash command like /today, /tomorrow, /wrap-up, /continue, /process-inbox:
1. Call datacore_command_run with the command name
2. Read the returned instructions
3. Execute each step using your available tools
4. Write output to the specified location (usually the journal)

For memory (engrams, learning, recall): use PLUR MCP tools (plur_session_start, plur_learn, plur_recall, etc.)`

// Export for testing
export { moduleTools as _moduleTools }
