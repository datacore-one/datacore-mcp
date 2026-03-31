// src/storage.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export type StorageMode = 'full' | 'core'

export interface SpacePaths {
  name: string
  journalPath: string
  knowledgePath: string
}

export interface StorageConfig {
  mode: StorageMode
  basePath: string
  engramsPath: string
  journalPath: string
  knowledgePath: string
  spaces: SpacePaths[]
  packsPath: string
  schemasPath: string
  exchangeInboxPath: string
  exchangeOutboxPath: string
  knowledgeSurfacingPath: string
  archivePath: string
  statePath: string
}

export function detectStorage(): StorageConfig {
  // 1. Explicit DATACORE_PATH (full installation)
  const dcPath = process.env.DATACORE_PATH
  if (dcPath && fs.existsSync(path.join(dcPath, '.datacore'))) {
    return fullConfig(dcPath)
  }

  // 2. Explicit core path (env var overrides auto-detection)
  const corePath = process.env.DATACORE_CORE_PATH
  if (corePath && fs.existsSync(corePath)) {
    return coreConfig(corePath)
  }

  // 3. Default full installation at ~/Data
  const defaultFull = path.join(os.homedir(), 'Data')
  if (fs.existsSync(path.join(defaultFull, '.datacore'))) {
    return fullConfig(defaultFull)
  }

  // 4. Default core mode at ~/Datacore
  return coreConfig(path.join(os.homedir(), 'Datacore'))
}

function discoverSpaces(basePath: string): SpacePaths[] {
  const spaces: SpacePaths[] = []
  try {
    for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+-/.test(entry.name)) continue
      const spacePath = path.join(basePath, entry.name)
      const name = entry.name.split('-').slice(1).join('-')
      // Find journal path (notes/journals/ or journal/)
      const notesJournals = path.join(spacePath, 'notes', 'journals')
      const journal = path.join(spacePath, 'journal')
      const journalPath = fs.existsSync(notesJournals) ? notesJournals : journal
      // Knowledge path
      const knowledgePath = path.join(spacePath, '3-knowledge')
      spaces.push({ name, journalPath, knowledgePath })
    }
  } catch { /* ignore */ }
  return spaces
}

function fullConfig(basePath: string): StorageConfig {
  const spaces = discoverSpaces(basePath)
  // Primary space is 0-personal (first space found, or fallback)
  const primary = spaces.find(s => s.name === 'personal') ?? spaces[0]
  return {
    mode: 'full',
    basePath,
    engramsPath: path.join(basePath, '.datacore', 'learning', 'engrams.yaml'),
    journalPath: primary?.journalPath ?? path.join(basePath, '0-personal', 'journal'),
    knowledgePath: primary?.knowledgePath ?? path.join(basePath, '0-personal', '3-knowledge'),
    spaces,
    packsPath: path.join(basePath, '.datacore', 'learning', 'packs'),
    schemasPath: path.join(basePath, '.datacore', 'learning', 'schemas.yaml'),
    exchangeInboxPath: path.join(basePath, '.datacore', 'learning', 'exchange', 'inbox'),
    exchangeOutboxPath: path.join(basePath, '.datacore', 'learning', 'exchange', 'outbox'),
    knowledgeSurfacingPath: path.join(basePath, '.datacore', 'state', 'knowledge-surfacing.yaml'),
    archivePath: path.join(basePath, '.datacore', 'learning', 'archive'),
    statePath: path.join(basePath, '.datacore', 'state'),
  }
}

function coreConfig(basePath: string): StorageConfig {
  return {
    mode: 'core',
    basePath,
    engramsPath: path.join(basePath, 'engrams.yaml'),
    journalPath: path.join(basePath, 'journal'),
    knowledgePath: path.join(basePath, 'knowledge'),
    spaces: [{ name: 'core', journalPath: path.join(basePath, 'journal'), knowledgePath: path.join(basePath, 'knowledge') }],
    packsPath: path.join(basePath, 'packs'),
    schemasPath: path.join(basePath, 'schemas.yaml'),
    exchangeInboxPath: path.join(basePath, 'exchange', 'inbox'),
    exchangeOutboxPath: path.join(basePath, 'exchange', 'outbox'),
    knowledgeSurfacingPath: path.join(basePath, 'state', 'knowledge-surfacing.yaml'),
    archivePath: path.join(basePath, 'archive'),
    statePath: path.join(basePath, 'state'),
  }
}

export function initCore(basePath: string): { isFirstRun: boolean } {
  const isFirstRun = !fs.existsSync(path.join(basePath, 'engrams.yaml'))
  for (const dir of ['journal', 'knowledge', 'packs', 'exchange/inbox', 'exchange/outbox', 'archive', 'state']) {
    const dirPath = path.join(basePath, dir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  const engramsPath = path.join(basePath, 'engrams.yaml')
  if (!fs.existsSync(engramsPath)) {
    fs.writeFileSync(engramsPath, 'engrams: []\n')
  }

  const configPath = path.join(basePath, 'config.yaml')
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, '# Datacore MCP configuration\nversion: 2\n# engrams:\n#   auto_promote: true  # engrams are active immediately (set false for manual review)\n# packs:\n#   trusted_publishers: []\n# search:\n#   max_results: 20\n#   snippet_length: 500\n# hints:\n#   enabled: true\n')
  }

  generateContextFiles(basePath)
  copyStarterPacks(basePath)
  return { isFirstRun }
}

// Generate editor context files so any AI assistant immediately understands Datacore.
// Files are only written if they don't exist — user edits are never overwritten.
function generateContextFiles(basePath: string): void {
  const files: Array<{ rel: string; content: string }> = [
    { rel: 'CLAUDE.md', content: CONTEXT_CLAUDE },
    { rel: 'AGENTS.md', content: CONTEXT_AGENTS },
    { rel: '.cursorrules', content: CONTEXT_CURSORRULES },
    { rel: '.github/copilot-instructions.md', content: CONTEXT_COPILOT },
  ]
  for (const { rel, content } of files) {
    const filePath = path.join(basePath, rel)
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content)
    }
  }
}

// Shared guide content used across all context files
const DATACORE_GUIDE = `Datacore provides AI assistants with productivity tools (capture, search, ingest, modules).
Persistent memory (engrams, sessions, feedback) is handled by **PLUR MCP** — a separate MCP server.

## Two MCP Servers

| Server | Tools | Purpose |
|--------|-------|---------|
| **PLUR MCP** | plur_session_start, plur_session_end, plur_learn, plur_recall_hybrid, plur_feedback, plur_forget | Persistent memory |
| **Datacore MCP** | datacore.capture, datacore.search, datacore.ingest, datacore.status, datacore.modules.* | Productivity |

## Proactive Behavior

Use memory tools automatically — do not wait to be asked:
- **plur_session_start**: Call at the beginning of every conversation
- **plur_learn**: Call when you discover patterns, preferences, insights, or corrections
- **plur_feedback**: Call after engrams are injected to rate usefulness
- **plur_session_end**: Call before the conversation ends

## Session Workflow

1. **plur_session_start** — Call this first. Gets relevant engrams + today's journal.
2. Work on the task. Use **plur_recall_hybrid** to search memory, **datacore.search** for files.
3. **plur_feedback** — Rate which injected engrams were helpful.
4. **plur_session_end** — Capture summary + suggest new engrams.

## Key Tools

### Memory (PLUR MCP)

| Tool | Purpose |
|------|---------|
| plur_session_start | Start here. Begin session with context injection. |
| plur_session_end | End session, capture journal + new engrams. |
| plur_learn | Record a reusable pattern, preference, or insight. |
| plur_recall_hybrid | Search engrams by keyword or semantic similarity. |
| plur_feedback | Rate engrams: positive/negative/neutral. |
| plur_forget | Retire an engram permanently. |

### Productivity (Datacore MCP)

| Tool | Purpose |
|------|---------|
| datacore.capture | Write a journal entry or knowledge note. |
| datacore.search | Search journal and knowledge files. |
| datacore.ingest | Import text and extract engram suggestions. |
| datacore.status | System health + recommendations. |
| datacore.modules.list | List installed modules. |
| datacore.modules.info | Detailed info about a module. |
| datacore.modules.health | Health check for modules. |

## Engram Lifecycle

plur_learn → active → inject → plur_feedback → stronger/weaker → plur_forget (retire)

- **active**: Appears in injection results when relevant to the task.
- **retired**: Permanently removed from injection.
- Positive feedback strengthens retrieval. Unused engrams naturally decay over time.

## Data Storage

All data is in this directory as plain text files:
- \`engrams.yaml\` — Your learned knowledge
- \`journal/\` — Daily session logs (YYYY-MM-DD.md)
- \`knowledge/\` — Ingested reference material
- \`packs/\` — Installed engram packs
- \`config.yaml\` — Configuration (all fields optional)
`
const CONTEXT_CLAUDE = `# Datacore

This is a Datacore installation — productivity tools for AI assistants.

${DATACORE_GUIDE}

## MCP Tools

Productivity tools are prefixed with \`datacore.\` (e.g., \`datacore.capture\`).
Memory tools use PLUR MCP (e.g., \`plur_session_start\`).
Call \`plur_session_start\` at the beginning of every conversation.
`

const CONTEXT_AGENTS = `# AGENTS.md

This directory is managed by [Datacore](https://github.com/datacore-one/mcp) — productivity tools for AI assistants.

${DATACORE_GUIDE}

## For AI Agents

Productivity tools are in the \`datacore.\` namespace. Memory tools are in PLUR MCP.
Start every session by calling \`plur_session_start\`.
`

const CONTEXT_CURSORRULES = `# Datacore

This directory is managed by Datacore — productivity tools for AI assistants.
Productivity tools are in the \`datacore.\` namespace. Memory tools are in PLUR MCP.

${DATACORE_GUIDE}`

const CONTEXT_COPILOT = `# Datacore

This directory is managed by [Datacore](https://github.com/datacore-one/mcp) — productivity tools for AI assistants.

${DATACORE_GUIDE}

## MCP Integration

Productivity tools are in the \`datacore.\` namespace. Memory tools are in PLUR MCP.
Start every session by calling \`plur_session_start\`.
`

function copyStarterPacks(basePath: string): void {
  const packsDir = path.join(basePath, 'packs')
  const bundledPacksDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..', 'packs'
  )

  if (!fs.existsSync(bundledPacksDir)) return

  for (const entry of fs.readdirSync(bundledPacksDir)) {
    const src = path.join(bundledPacksDir, entry)
    const dest = path.join(packsDir, entry)
    if (!fs.existsSync(dest) && fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true })
    }
  }
}
