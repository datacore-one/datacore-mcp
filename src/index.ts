import { runStdio, runHttp } from './server.js'
import { currentVersion } from './version.js'

const args = process.argv.slice(2)

if (args.includes('--version') || args.includes('-v')) {
  console.log(currentVersion)
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Datacore MCP Server v${currentVersion}
An MCP server that gives AI assistants persistent memory through engrams.

Usage:
  npx @datacore-one/mcp           Start MCP server (stdio transport)
  npx @datacore-one/mcp --http    Start MCP server (HTTP transport)
  npx @datacore-one/mcp --help    Show this help
  npx @datacore-one/mcp --version Show version

Tools:
  Productivity
    datacore.capture         Capture a journal entry or knowledge note
    datacore.search          Search journal and knowledge by keyword
    datacore.ingest          Ingest text as knowledge note with engram extraction
    datacore.status          System status, counts, update info

  Modules (full mode)
    datacore.modules.list    List installed modules
    datacore.modules.info    Detailed info about a module
    datacore.modules.health  Health check for modules

  Note: Memory tools (learn, recall, feedback, forget, sessions) are now
  in PLUR MCP (@plur-ai/mcp). Install separately for persistent memory.

Configuration:
  DATACORE_PATH             Full installation path (default: ~/Data)
  DATACORE_CORE_PATH        Core mode storage path (default: ~/Datacore)
  DATACORE_TIMEZONE         IANA timezone (e.g., Europe/Ljubljana)
  DATACORE_LOG_LEVEL        Log level: debug|info|warning|error (default: warning)
  DATACORE_CACHE_TTL        File cache TTL in seconds (default: 60)
  DATACORE_TRANSPORT        Transport: stdio or http (default: stdio)
  DATACORE_HTTP_PORT        HTTP transport port (default: 3100)
  DATACORE_HTTP_HOST        HTTP transport bind address (default: 127.0.0.1)

Examples:
  # Add to Claude Desktop config
  { "mcpServers": { "datacore": { "command": "npx", "args": ["@datacore-one/mcp"] } } }

  # Run with HTTP transport on custom port
  DATACORE_HTTP_PORT=8080 npx @datacore-one/mcp --http
`)
  process.exit(0)
}

const useHttp = args.includes('--http') || process.env.DATACORE_TRANSPORT === 'http'

const start = useHttp ? runHttp : runStdio
start().catch((error) => {
  console.error('Failed to start Datacore MCP server:', error)
  process.exit(1)
})
