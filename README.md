# @datacore-one/mcp

Persistent memory for AI assistants.

## Why

AI assistants are stateless. Every conversation starts from zero. Your AI forgets your preferences, your domain knowledge, your past decisions.

Datacore changes that. It gives AI assistants persistent memory through **engrams** -- typed knowledge units that get injected into context when relevant. Your AI remembers your coding patterns, learns your domain, and builds on previous work.

Not a RAG system. Not a vector database you have to manage. Just an MCP server that makes your AI smarter over time.

## Quick Start

Install globally:

```bash
npm install -g @datacore-one/mcp
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "datacore": {
      "command": "datacore-mcp"
    }
  }
}
```

Or for Claude Code, add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "datacore": {
      "command": "datacore-mcp"
    }
  }
}
```

On first use, the server creates `~/Datacore/` with your engrams, journal, and knowledge files. Everything is plain text -- no databases, no lock-in.

## Two Modes

| Mode | Storage | What You Get |
|------|---------|--------------|
| **Core** (`~/Datacore`) | Flat files | Engrams, journal, knowledge, packs |
| **Full** (`~/Data`) | Datacore system | + modules, GTD, spaces, Datacortex |

Mode is auto-detected. If you have a full [Datacore](https://github.com/datacore-one/datacore) installation at `~/Data`, it uses that. Otherwise it creates a lightweight `~/Datacore` directory.

Override with environment variables: `DATACORE_PATH` (full) or `DATACORE_CORE_PATH` (core).

## Tools

### Core

| Tool | Description |
|------|-------------|
| `datacore.capture` | Write a journal entry or knowledge note |
| `datacore.learn` | Create an engram from a statement |
| `datacore.inject` | Get relevant engrams for a task |
| `datacore.search` | Search journal and knowledge by keyword |
| `datacore.ingest` | Ingest text as a knowledge note with engram extraction |
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
| `datacore.packs.install` | Install a pack |
| `datacore.packs.export` | Export your engrams as a shareable pack |

### Modules (full mode only)

| Tool | Description |
|------|-------------|
| `datacore.modules.list` | List installed modules |
| `datacore.modules.info` | Detailed info about a module |
| `datacore.modules.health` | Health check for modules |

## How Engrams Work

Engrams are typed knowledge units with activation dynamics:

```yaml
id: ENG-2026-0221-001
statement: "Always run tests before deploying"
type: behavioral
scope: global
activation:
  retrieval_strength: 0.8
  storage_strength: 1.0
```

When your AI starts a task, `datacore.inject` returns the most relevant engrams based on tags, scope, and activation strength. Engrams that prove useful get reinforced through `datacore.feedback`; unused ones naturally decay.

This creates a learning loop: your AI gets better at its job over time without you managing anything.

## Pack System

Engram packs are curated knowledge bundles you can install and share.

```
datacore.packs.discover  -- browse available packs
datacore.packs.install   -- install a pack
datacore.packs.export    -- export your engrams as a pack
```

Bundled starter packs are installed automatically on first run.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATACORE_PATH` | `~/Data` | Full installation path |
| `DATACORE_CORE_PATH` | `~/Datacore` | Core mode storage path |
| `DATACORE_TIMEZONE` | System | IANA timezone (e.g., `Europe/Ljubljana`) |
| `DATACORE_LOG_LEVEL` | `warning` | `debug`, `info`, `warning`, `error` |
| `DATACORE_CACHE_TTL` | `60` | File cache TTL in seconds |
| `DATACORE_TRANSPORT` | `stdio` | `stdio` or `http` |
| `DATACORE_HTTP_PORT` | `3100` | HTTP transport port |
| `DATACORE_HTTP_HOST` | `127.0.0.1` | HTTP bind address |

## HTTP Transport

For remote or multi-client setups:

```bash
DATACORE_HTTP_PORT=8080 datacore-mcp --http
```

Health check: `GET /health`
MCP endpoint: `POST /mcp`

## Module System (Full Mode)

Full Datacore installations extend the MCP server with module-provided tools. Modules are discovered from `.datacore/modules/` and space-scoped directories. Each module can register its own tools under the `datacore.[module].[tool]` namespace.

## License

MIT
