# Datacore MCP Server

*Last updated: 2026-02-21 (inject scoring: scope filtering, feedback/consolidated boosts)*

## Purpose

MCP (Model Context Protocol) server that exposes Datacore's knowledge system and module capabilities as tools for AI assistants. Serves as both the external product (Claude Desktop, Cursor integration) and the internal module communication bus.

## Architecture

The server has two tool layers: **core tools** (hardcoded, always available) and **module tools** (dynamically loaded from installed Datacore modules).

### Components

| Component | Responsibility |
|-----------|---------------|
| `server.ts` | MCP protocol handling, tool routing, startup |
| `modules.ts` | Module discovery, dynamic tool loading, namespacing |
| `storage.ts` | Storage mode detection (full Datacore install vs standalone) |
| `engrams.ts` | Learning system - engram CRUD and injection |
| `inject.ts` | Context injection engine - scope filtering, feedback/consolidated scoring |
| `tools/` | Core tool handlers (capture, learn, search, etc.) |

### Data Flow

1. Server starts, detects storage mode (full install at `~/Data` or standalone)
2. `modules.ts` scans `.datacore/modules/*/module.yaml` for tool declarations
3. For each module with `provides.tools`, dynamically imports `tools/index.js`
4. Tools registered as `datacore.[module].[tool]` (auto-namespaced)
5. Incoming MCP requests routed to core handler or module tool handler

### Module Tool Loading

```
.datacore/modules/gtd/module.yaml     ->  declares: inbox_count, add_task, ...
.datacore/modules/gtd/tools/index.js  ->  exports: tool definitions with Zod schemas
                                       ->  registered as: datacore.gtd.inbox_count
```

Dual-gating: tools must be declared in `module.yaml` AND exported from `tools/index.js`.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Plain JS for module tools (not TS) | Dynamic import compatibility; modules are external |
| Zod for input schemas | Runtime validation + JSON Schema generation for MCP protocol |
| Auto-namespacing (`datacore.module.tool`) | Prevents collisions, enables discovery |
| Dual storage modes (full/standalone) | Works as installed module or standalone npm package |
| Module tools as `tools/index.js` | Convention over configuration; single entry point per module |

## Pitfalls

- **Module tool files must be plain JS**: The MCP server dynamically imports module tools at runtime. TypeScript files will not load unless pre-compiled.
- **Zod version alignment**: Module tools import Zod for schema definitions. The Zod version in the module must be compatible with the MCP server's version.
- **Storage detection**: `storage.ts` tries `~/Data` first, falls back to CWD. If neither has `.datacore/`, runs in standalone mode with no module tools.
- **Parameter passthrough in inject pipeline**: When adding parameters to `selectEngrams()`, they must also be passed through `inject-tool.ts` (tool handler) and `scoreEngram()`. Missing any layer silently drops the parameter.

## Codebase

```
datacore-mcp/
├── src/
│   ├── index.ts          # Entry point (stdio transport)
│   ├── server.ts         # MCP server setup, tool routing
│   ├── modules.ts        # Module discovery + dynamic loading
│   ├── storage.ts        # Storage mode detection
│   ├── engrams.ts        # Learning system CRUD
│   ├── inject.ts         # Engram injection engine
│   ├── version.ts        # Version + update check
│   ├── tools/            # Core tool handlers
│   │   ├── index.ts      # Tool registry
│   │   ├── capture.ts    # Journal/knowledge capture
│   │   ├── learn.ts      # Create engrams
│   │   ├── inject-tool.ts# Get relevant engrams
│   │   ├── search.ts     # Content search
│   │   ├── ingest.ts     # File ingestion
│   │   ├── discover.ts   # Module discovery info
│   │   ├── install.ts    # Module installation
│   │   ├── status.ts     # System status
│   │   ├── modules-list.ts   # List installed modules
│   │   ├── modules-info.ts   # Module detail info
│   │   └── modules-health.ts # Module health check
│   └── schemas/          # Shared Zod schemas
├── packs/                # Starter engram packs
├── registry/             # Published module registry
├── test/                 # Vitest test files
├── tsconfig.json
├── tsup.config.ts        # Build config
└── vitest.config.ts
```

**Entry points:**
- `src/server.ts` - Start here to understand tool routing and module loading
- `src/modules.ts` - For understanding module auto-discovery
- `src/tools/index.ts` - For adding new core tools

## Getting Started

1. `npm install` to install dependencies
2. `npm run build` to compile TypeScript
3. `npm run test` to run test suite
4. `npm start` to run MCP server (stdio transport)

For development: `npm run dev` watches for changes and rebuilds.

To add a module tool: create `tools/index.js` in the module directory exporting a `tools` array with Zod-validated handlers. Declare tools in `module.yaml` under `provides.tools`.
