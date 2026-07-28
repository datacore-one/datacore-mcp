# @datacore-one/mcp

A plain-text second brain for AI assistants — journal, knowledge, and productivity tools over MCP.

## Why

AI assistants are great at reasoning but have nowhere to put what matters: your decisions, your notes, your day.

Datacore gives them a structured, plain-text second brain — capture journal entries and knowledge notes, search them back, get canonical date handling, and extend with modules (GTD, health, trading, and more).

Persistent **memory** — engrams, learning, and recall — is handled by Datacore's companion server, [PLUR](https://www.npmjs.com/package/@plur-ai/mcp) (`plur_*` tools). Run the two side by side: PLUR remembers, Datacore organizes.

Not a RAG system. Not a vector database you have to manage. Just plain-text files and an MCP server.

## Quick Start

Install globally:

```bash
npm install -g @datacore-one/mcp
```

Then connect from any MCP-compatible client. On first use, the server creates `~/Datacore/` with:

- `journal/` — Daily session logs
- `knowledge/` — Ingested reference material
- `engrams.yaml` — Shared engram store, read and written by the companion PLUR MCP
- `packs/` — Engram packs used by PLUR
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

Then allow Datacore tools in `.claude/settings.json` (or `.claude/settings.local.json`):

```json
{
  "permissions": {
    "allow": [
      "mcp__datacore"
    ]
  },
  "enableAllProjectMcpServers": true
}
```

This auto-approves all Datacore MCP tools (capture, search, status, etc.) so you don't get prompted on every call. The `enableAllProjectMcpServers` setting ensures the MCP server defined in `.mcp.json` is activated automatically.

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
| **Core** (`~/Datacore`) | Flat files | Journal, knowledge, dates, packs |
| **Full** (`~/Data`) | Datacore system | + modules, GTD, spaces, Datacortex |

Mode is auto-detected. If you have a full [Datacore](https://github.com/datacore-one/datacore) installation at `~/Data`, it uses that. Otherwise it creates a lightweight `~/Datacore` directory.

Override with environment variables: `DATACORE_PATH` (full) or `DATACORE_CORE_PATH` (core).

## Tools (5 core + 3 full-mode)

Datacore exposes productivity tools. **Memory — engrams, learning, recall, packs — is provided by the companion [PLUR MCP](https://www.npmjs.com/package/@plur-ai/mcp) server (`plur_*` tools), not by Datacore.**

### Core

| Tool | Description |
|------|-------------|
| `datacore_capture` | Write a journal entry or knowledge note |
| `datacore_search` | Search journal and knowledge by keyword or semantic |
| `datacore_ingest` | Ingest text as a knowledge note |
| `datacore_status` | System status, counts, actionable recommendations |
| `datacore_date` | Canonical date operations (today, day-of-week, validate, add/sub, parse, org-stamp) |

### Modules (full mode only)

| Tool | Description |
|------|-------------|
| `datacore_modules_list` | List installed modules |
| `datacore_modules_info` | Detailed info about a module |
| `datacore_modules_health` | Health check for modules |

Tool names use underscores to satisfy the MCP tool-name rule `^[a-zA-Z0-9_-]{1,64}$`. Legacy dot-namespaced names (`datacore.capture`) are still accepted as aliases for backward compatibility.

## Prompts

The server provides MCP prompts — workflow templates your AI can discover and use automatically:

| Prompt | Description |
|--------|-------------|
| `datacore-capture-guide` | Capture a journal entry or knowledge note |
| `datacore-guide` | Complete guide to Datacore tools and workflows |

Prompts are the primary way the AI understands Datacore. When your AI connects, it can list available prompts and immediately knows how to capture, search, and organize — and that persistent memory lives in PLUR.

## Resources

| Resource | Description |
|----------|-------------|
| `datacore://guide` | Agent workflow reference (markdown) |
| `datacore://status` | System status summary (JSON) |
| `datacore://journal/today` | Today's journal entry (markdown) |
| `datacore://journal/{date}` | Journal entry by date |

## Memory (via PLUR)

Datacore organizes; **[PLUR](https://www.npmjs.com/package/@plur-ai/mcp) remembers.**

Persistent memory — engrams, learning, recall, feedback, and engram packs — lives in the companion PLUR MCP server (`plur_*` tools). Datacore scaffolds the shared, plain-text data directory (including `engrams.yaml` and `packs/`) that PLUR reads and writes, so both servers work against the same `~/Data` or `~/Datacore` store.

Connect both in your MCP client and your AI gets a second brain (Datacore) plus persistent memory (PLUR). See the [PLUR docs](https://www.npmjs.com/package/@plur-ai/mcp) for the memory toolset and engram lifecycle.

> **Upgrading from ≤1.5?** The engram engine (`learn`, `inject`, `recall`, `promote`, `feedback`, `forget`, packs, and the engagement/XP layer) moved out of Datacore into PLUR. Install [`@plur-ai/mcp`](https://www.npmjs.com/package/@plur-ai/mcp) alongside Datacore to keep that functionality.

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
search:
  max_results: 20
  snippet_length: 500        # chars around match
hints:
  enabled: true              # include _hints in tool responses for agent guidance
```

All fields have defaults -- the file is optional. Memory-related settings (engrams, packs, engagement) are configured in PLUR, not here.

## HTTP Transport

For remote or multi-client setups:

```bash
DATACORE_HTTP_PORT=8080 datacore-mcp --http
```

- MCP endpoint: `POST /mcp`
- Health check: `GET /health`
- Default bind: `127.0.0.1:3100`

## Module System (Full Mode)

Full Datacore installations extend the MCP server with module-provided tools. Modules are discovered from `.datacore/modules/` and space-scoped directories. Each module can register its own tools under the `datacore_[module]_[tool]` namespace.

## License

MIT
