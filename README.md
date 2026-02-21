# Datacore MCP Server

An MCP server that gives AI assistants persistent memory through engrams — reusable knowledge units that get injected into context when relevant.

Works standalone (any Claude Desktop user) or as part of a full [Datacore](https://github.com/datacore-one/datacore) installation.

## Quick Start

```json
// Claude Desktop config (~/.config/claude/claude_desktop_config.json)
{
  "mcpServers": {
    "datacore": {
      "command": "npx",
      "args": ["@datacore-one/mcp"]
    }
  }
}
```

Or run directly:

```bash
npx @datacore-one/mcp
npx @datacore-one/mcp --version
npx @datacore-one/mcp --help
```

## Two Modes

| Mode | Storage | Features |
|------|---------|----------|
| **Standalone** (`~/Datacore`) | Flat files | Engrams, journal, knowledge, packs |
| **Full** (`~/Data` with `.datacore/`) | Datacore system | + modules, spaces, GTD integration |

## Tools

### Core

| Tool | Description |
|------|-------------|
| `datacore.capture` | Capture a journal entry or knowledge note |
| `datacore.learn` | Create an engram from a statement |
| `datacore.inject` | Get relevant engrams for a task |
| `datacore.search` | Search journal and knowledge by keyword |
| `datacore.ingest` | Ingest text as knowledge note with engram extraction |
| `datacore.status` | System status, counts, update info |

### Lifecycle

| Tool | Description |
|------|-------------|
| `datacore.feedback` | Signal whether an injected engram was helpful |
| `datacore.forget` | Retire an engram by ID or search |

### Packs

| Tool | Description |
|------|-------------|
| `datacore.packs.discover` | Browse available engram packs |
| `datacore.packs.install` | Install or upgrade an engram pack |
| `datacore.packs.export` | Export personal engrams as a shareable pack |

### Modules (full mode)

| Tool | Description |
|------|-------------|
| `datacore.modules.list` | List installed modules |
| `datacore.modules.info` | Detailed info about a module |
| `datacore.modules.health` | Health check for modules |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DATACORE_PATH` | `~/Data` | Full installation path |
| `DATACORE_STANDALONE_PATH` | `~/Datacore` | Standalone storage path |
| `DATACORE_TIMEZONE` | System default | IANA timezone (e.g., `Europe/Ljubljana`) |
| `DATACORE_LOG_LEVEL` | `warning` | Log level: `debug\|info\|warning\|error` |
| `DATACORE_CACHE_TTL` | `60` | File cache TTL in seconds |
| `DATACORE_TRANSPORT` | `stdio` | Transport: `stdio` or `http` |
| `DATACORE_HTTP_PORT` | `3100` | HTTP transport port |
| `DATACORE_HTTP_HOST` | `127.0.0.1` | HTTP transport bind address |
| `DATACORE_PYTHON` | `python3` | Python path for Datacortex bridge |

## Pack System

Engram packs are curated knowledge bundles. Install from the registry:

```
datacore.packs.discover → browse available packs
datacore.packs.install → install a pack
```

Bundled packs: `datacore-starter-v1`, `fds-principles-v1`, `dips-v1`

## Module System

Full Datacore installations can extend the MCP server with module-provided tools. Modules are discovered from `.datacore/modules/` and space-scoped `[space]/.datacore/modules/`.

## License

MIT
