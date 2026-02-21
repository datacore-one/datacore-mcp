// src/storage.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export type StorageMode = 'full' | 'core'

export interface StorageConfig {
  mode: StorageMode
  basePath: string
  engramsPath: string
  journalPath: string
  knowledgePath: string
  packsPath: string
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

function fullConfig(basePath: string): StorageConfig {
  return {
    mode: 'full',
    basePath,
    engramsPath: path.join(basePath, '.datacore', 'learning', 'engrams.yaml'),
    journalPath: path.join(basePath, '0-personal', 'journal'),
    knowledgePath: path.join(basePath, '0-personal', '3-knowledge'),
    packsPath: path.join(basePath, '.datacore', 'learning', 'packs'),
  }
}

function coreConfig(basePath: string): StorageConfig {
  return {
    mode: 'core',
    basePath,
    engramsPath: path.join(basePath, 'engrams.yaml'),
    journalPath: path.join(basePath, 'journal'),
    knowledgePath: path.join(basePath, 'knowledge'),
    packsPath: path.join(basePath, 'packs'),
  }
}

export function initCore(basePath: string): { isFirstRun: boolean } {
  const isFirstRun = !fs.existsSync(path.join(basePath, 'engrams.yaml'))
  for (const dir of ['journal', 'knowledge', 'packs']) {
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
    fs.writeFileSync(configPath, '# Datacore MCP configuration\nversion: 2\n# engrams:\n#   auto_promote: false\n# packs:\n#   trusted_publishers: []\n# search:\n#   max_results: 20\n#   snippet_length: 500\n# hints:\n#   enabled: true\n')
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
const DATACORE_GUIDE = `Datacore gives AI assistants persistent memory through **engrams** — typed knowledge units
that get injected into context when relevant.

## Session Workflow

1. **datacore.session.start** — Call this first. Gets relevant engrams + today's journal.
2. Work on the task. Use **datacore.recall** to search everything.
3. **datacore.feedback** — Rate which injected engrams were helpful.
4. **datacore.session.end** — Capture summary + suggest new engrams.

## Key Tools

| Tool | Purpose |
|------|---------|
| session.start | Start here. Begin session with context injection. |
| session.end | End session, capture journal + new engrams. |
| learn | Record a reusable insight (creates candidate engram). |
| promote | Activate candidate engrams. |
| inject | Get relevant engrams for a specific task. |
| recall | Search all sources (engrams + journal + knowledge). |
| capture | Write a journal entry or knowledge note. |
| search | Search journal and knowledge files. |
| ingest | Import text and extract engram suggestions. |
| feedback | Rate engrams: positive/negative/neutral. |
| forget | Retire an engram permanently. |
| status | System health + recommendations. |
| packs.discover | Browse available engram packs. |
| packs.install | Install a pack. |
| packs.export | Export your engrams as a pack. |

## Engram Lifecycle

learn → candidate → promote → active → inject → feedback → stronger/weaker → forget (retire)

- **candidate**: Created but not yet active. Won't appear in inject results.
- **active**: Appears in inject results when relevant to the task.
- **retired**: Permanently removed from injection.

Positive feedback strengthens retrieval. Unused engrams naturally decay over time.

## Data Storage

All data is in this directory as plain text files:
- \`engrams.yaml\` — Your learned knowledge
- \`journal/\` — Daily session logs (YYYY-MM-DD.md)
- \`knowledge/\` — Ingested reference material
- \`packs/\` — Installed engram packs
- \`config.yaml\` — Configuration (all fields optional)
`

const CONTEXT_CLAUDE = `# Datacore

This is a Datacore installation — persistent memory for AI assistants.

${DATACORE_GUIDE}

## MCP Tools

All tools are prefixed with \`datacore.\` (e.g., \`datacore.session.start\`).
Call \`datacore.session.start\` at the beginning of every conversation.
`

const CONTEXT_AGENTS = `# AGENTS.md

This directory is managed by [Datacore](https://github.com/datacore-one/mcp) — persistent memory for AI assistants.

${DATACORE_GUIDE}

## For AI Agents

All tools are available via MCP under the \`datacore.\` namespace.
Start every session by calling \`datacore.session.start\`.
`

const CONTEXT_CURSORRULES = `# Datacore

This directory is managed by Datacore — persistent memory for AI assistants.
All tools are available via MCP under the \`datacore.\` namespace.

${DATACORE_GUIDE}`

const CONTEXT_COPILOT = `# Datacore

This directory is managed by [Datacore](https://github.com/datacore-one/mcp) — persistent memory for AI assistants.

${DATACORE_GUIDE}

## MCP Integration

All tools are available via MCP under the \`datacore.\` namespace.
Start every session by calling \`datacore.session.start\`.
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
