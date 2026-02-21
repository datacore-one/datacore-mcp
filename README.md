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

Then connect from any MCP-compatible client. On first use, the server creates `~/Datacore/` with:

- `engrams.yaml` — Your learned knowledge
- `journal/` — Daily session logs
- `knowledge/` — Ingested reference material
- `packs/` — Engram packs (starter packs installed automatically)
- `config.yaml` — Configuration (all fields optional)
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md` — Editor context files so any AI assistant immediately understands Datacore

Everything is plain text -- no databases, no lock-in.

## Connecting

Datacore is a standard [MCP](https://modelcontextprotocol.io) server. It works with any client that speaks MCP v1.0+ over stdio or HTTP -- the AI model behind the client does not matter.

### Claude Code

Add to `.mcp.json` in your project root (or `~/.claude.json` globally):

```json
{
  "mcpServers": {
    "datacore": {
      "command": "datacore-mcp"
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "datacore": {
      "command": "datacore-mcp"
    }
  }
}
```

### Cursor / Windsurf / Other MCP Clients

Most MCP-compatible editors use the same config format. Check your editor's MCP documentation for where to place the server config. The command is always `datacore-mcp`.

### HTTP (Remote / Multi-Client)

For shared or remote setups, run in HTTP mode:

```bash
datacore-mcp --http
```

Then point your MCP client to `http://127.0.0.1:3100/mcp`. See [HTTP Transport](#http-transport) for options.

## Two Modes

| Mode | Storage | What You Get |
|------|---------|--------------|
| **Core** (`~/Datacore`) | Flat files | Engrams, journal, knowledge, packs |
| **Full** (`~/Data`) | Datacore system | + modules, GTD, spaces, Datacortex |

Mode is auto-detected. If you have a full [Datacore](https://github.com/datacore-one/datacore) installation at `~/Data`, it uses that. Otherwise it creates a lightweight `~/Datacore` directory.

Override with environment variables: `DATACORE_PATH` (full) or `DATACORE_CORE_PATH` (core).

## Tools (17 core + 3 full-mode)

### Session

| Tool | Description |
|------|-------------|
| `datacore.session.start` | Begin a session — injects relevant engrams, shows today's journal |
| `datacore.session.end` | End a session — captures journal summary and creates engrams |

### Core

| Tool | Description |
|------|-------------|
| `datacore.capture` | Write a journal entry or knowledge note |
| `datacore.learn` | Create an engram from a statement |
| `datacore.inject` | Get relevant engrams for a task |
| `datacore.recall` | Search all sources (engrams + journal + knowledge) |
| `datacore.search` | Search journal and knowledge by keyword or semantic |
| `datacore.ingest` | Ingest text as a knowledge note with engram extraction |
| `datacore.status` | System status, counts, actionable recommendations |

### Lifecycle

| Tool | Description |
|------|-------------|
| `datacore.promote` | Activate candidate engrams |
| `datacore.feedback` | Signal whether engrams were helpful (single or batch) |
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

## Prompts

The server provides MCP prompts — workflow templates your AI can discover and use automatically:

| Prompt | Description |
|--------|-------------|
| `datacore-session` | Start a working session with context injection |
| `datacore-learn` | Record a learning through the engram lifecycle |
| `datacore-guide` | Complete guide to all tools and workflows |

Prompts are the primary way the AI understands Datacore. When your AI connects, it can list available prompts and immediately knows the session lifecycle, engram workflow, and how all tools relate.

## Resources

| Resource | Description |
|----------|-------------|
| `datacore://guide` | Agent workflow reference (markdown) |
| `datacore://status` | System status summary (JSON) |
| `datacore://engrams/active` | All active engrams (JSON) |
| `datacore://journal/today` | Today's journal entry (markdown) |
| `datacore://journal/{date}` | Journal entry by date |
| `datacore://engrams/{id}` | Specific engram by ID |

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

### Environment Variables

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

### config.yaml

Create `config.yaml` in your Datacore directory (or `.datacore/config.yaml` in full mode):

```yaml
version: 2
engrams:
  auto_promote: false        # true: learn creates active engrams immediately
packs:
  trusted_publishers: []     # publisher IDs whose packs are flagged for auto-install
search:
  max_results: 20
  snippet_length: 500        # chars around match
hints:
  enabled: true              # include _hints in tool responses for agent guidance
```

All fields have defaults -- the file is optional.

## HTTP Transport

For remote or multi-client setups:

```bash
DATACORE_HTTP_PORT=8080 datacore-mcp --http
```

- MCP endpoint: `POST /mcp`
- Health check: `GET /health`
- Default bind: `127.0.0.1:3100`

## Module System (Full Mode)

Full Datacore installations extend the MCP server with module-provided tools. Modules are discovered from `.datacore/modules/` and space-scoped directories. Each module can register its own tools under the `datacore.[module].[tool]` namespace.

## License

MIT
