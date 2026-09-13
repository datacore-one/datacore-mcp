# @datacore-one/mcp

[![CI](https://github.com/datacore-one/datacore-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/datacore-one/datacore-mcp/actions/workflows/ci.yml)

The knowledge and task orchestration layer for AI assistants — journals, GTD, Zettelkasten, and autonomous workflows over plain-text files via MCP.

## Why

AI assistants are great at reasoning but have nowhere to put what matters: your decisions, your tasks, your notes.

Datacore gives them a structured, plain-text home — capture journal entries, manage GTD task lists, build a Zettelkasten, and extend with modules for autonomous overnight workflows.

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

Managed installations select exactly one absolute `DATACORE_PATH` (existing
full installation) or `DATACORE_CORE_PATH` (existing or new core store). Invalid
explicit paths fail without choosing a different store. Leave both unset only
when the documented HOME-based discovery is intended.

Set absolute `DATACORE_LIB` and `DATACORE_PYTHON` to the qualified core library
and interpreter. Failed explicit selections do not fall back to mutable data
code or another Python. Ledger status uses the installed `ledger_health.py`
version 1 protocol and canonical space discovery. Missing helpers, unreadable
spaces, busy writers or invalid responses remain unverified and cannot yield
“System healthy.” Older cores need reconciliation before ledger health can be
established. Datacortex uses the same interpreter and the module next to that
installed library, with bounded foreground process cleanup; deployment remains
responsible for independent OS and credential isolation.

Full-mode space discovery requires the installed `space_catalog.py` version 1
helper. It calls the core `spaces.py` implementation (DIP-0015) and includes
root, named, nested and canonical legacy spaces. Missing or malformed discovery
refuses startup. Personal capture/ingestion and global module data require one
unambiguous personal space; they never default to a team space. Scoped module
names use the stable marker name and data paths use its actual directory.
After a space identity or routing path changes, restart the server; stale
sessions refuse tool calls. Existing data is not moved or renamed by discovery.
The earlier audit's unpublished ordinal-based scoped tool names are replaced
by `datacore_<stable-space-name>_<module>_<tool>`; global names remain unchanged.

Journal resources validate calendar dates and read bounded, unlinked regular
files. Keyword search reads current source files without retaining a process
content cache; an index in one space cannot hide matches in another. Linked,
changing, oversized or unreadable files and scan limits yield an explicit
incomplete-coverage warning. Files are limited to 4 MiB, with a 32 MiB content
budget, 10,000 directory entries and depth 32 per keyword search.

Capture and ingestion create private notes with unique filenames and complete,
non-replacing publication; existing note filenames and contents are preserved.
Journal capture appends without rewriting earlier entries and syncs before
acknowledging success. Local MCP writers and initializers coordinate through
SQLite in `state/mcp-file-writes/coordination.db`; process death releases that
lock. Keep this machine-local state out of synchronization. Initialization
publishes complete defaults and packs without replacing existing user files.
Aliased write directories and linked mutable journals are refused.

These write checks are qualified on macOS/Linux filesystems. They do not provide
cross-host locking or an exactly-once retry protocol. An interrupted request may
have left a complete note or a partial new journal entry; inspect the destination
before retrying a request whose durability could not be confirmed. Incomplete
`.datacore-pending-*` artifacts are private and are not acknowledged notes.

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

Connect both in your MCP client and your AI gets structured knowledge and task management (Datacore) plus persistent memory (PLUR). See the [PLUR docs](https://www.npmjs.com/package/@plur-ai/mcp) for the memory toolset and engram lifecycle.

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

Full Datacore installations discover module tools from `.datacore/modules/` and `[space]/.datacore/modules/`. Modules ship executable `tools/index.js`; discovery does not compile TypeScript.

| Installation | Callable name | Default data directory |
| --- | --- | --- |
| Global `crm` | `datacore_crm_lookup` | `0-personal/.datacore/module-data/crm/data/` |
| Personal `crm` | `datacore_0-personal_crm_lookup` | `0-personal/.datacore/module-data/crm/data/` |
| Team `crm` | `datacore_1-team_crm_lookup` | `1-team/.datacore/module-data/crm/data/` |

Scope is part of each space module's callable identity. Calls never choose a data destination by discovery order or fall back to a module in another space. Third-party module `acme/crm` uses namespace `acme-crm`; its private data directory uses the manifest name (`.../module-data/acme/crm/data/`). Module code directories may use the flattened name `acme-crm`.

**Upgrade:** update callers of space-installed tools to the name advertised by `tools/list`. Their old unqualified names have no implicit alias, since such an alias could silently select a different space. Existing global callable names remain stable. Duplicate names (including collisions with core tools) and invalid or overlong identifiers are refused; unrelated tools remain available. Names must fit the 64-character MCP limit.

Private data now has a separate root from installed module code. Legacy `data`,
`state`, or `settings.local.yaml` in either the installed code or historical
scoped directory blocks that module with `module-data-unverified`. Stop its
writers, preserve backups, and use core's `module_data_migrate.py` with the
verified space identity and legacy source directory. The helper retains the
originals in private backup and supports interrupted retries; an incomplete
receipt keeps the module unavailable. See core's `.datacore/lib/RUNTIME.md`
for the procedure and filesystem limits. Loading modules never moves old data
or silently replaces it with an empty store. Verify real reads and ownership
under the installed service identity before resuming it.

The full-mode server exposes all installed scopes to its owner. `dataPath` is a routing convention: trusted module handlers execute in the same process and retain its filesystem privileges. Use independently restricted processes, credentials and storage roots where separate security contexts are required.

Registration validates handlers and argument contracts. Zod 3, Zod 4 and
supported JSON Schema tools retain input validation; raw JSON Schema cannot
fetch remote references or silently coerce input. Health reports the actual
startup registration snapshot for each installed scope, without importing
modules again or copying raw exceptions. A name shared by multiple scopes
cannot select one health result implicitly.

The `@datacore-one/mcp/runtime` export provides `z` and `yaml` from the selected
package environment in ESM and CommonJS forms. The module must first be able to
resolve the MCP package through an explicit installed package binding. A global
installation or `NODE_PATH` alone does not make an ESM import resolve. Qualify
that binding from the module's physical directory and service identity, or ship
a qualified module bundle. [DIP-0049](https://github.com/datacore-one/datacore-dips/blob/main/DIP-0049-module-tool-loading-architecture.md)
is a draft design discussion, not a claim that its entire installation proposal
has been implemented.

## License

MIT

## Development verification

The full release gate exercises both standalone mode and the actual core
discovery provider. Check out the core commit pinned in `.github/workflows/ci.yml`,
create a Python 3.10+ virtual environment, and install
`scripts/requirements-core-tests.txt` with `pip install --require-hashes --no-deps`.
Set `DATACORE_LIB` to that checkout's absolute `.datacore/lib` path and
`DATACORE_PYTHON` to the virtual environment's absolute interpreter path. Run
`npm ci`, `npm run verify`, and `./node_modules/.bin/tsc --noEmit`. CI performs
these steps in isolated directories and never uses an operator installation.
