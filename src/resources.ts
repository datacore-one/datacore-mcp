// src/resources.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { loadEngrams } from './engrams.js'
import { localDate } from './tools/capture.js'
import type { StorageConfig } from './storage.js'
import * as fs from 'fs'
import * as path from 'path'
import { currentVersion } from './version.js'

export function registerResources(server: Server, storage: StorageConfig): void {
  // List static resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'datacore://status',
        name: 'Datacore Status',
        description: 'Current system status summary',
        mimeType: 'application/json',
      },
      {
        uri: 'datacore://engrams/active',
        name: 'Active Engrams',
        description: 'All active engrams with their metadata',
        mimeType: 'application/json',
      },
      {
        uri: 'datacore://journal/today',
        name: "Today's Journal",
        description: "Today's journal entry",
        mimeType: 'text/markdown',
      },
      {
        uri: 'datacore://guide',
        name: 'Datacore Agent Guide',
        description: 'Workflow guide for AI agents: session lifecycle, engram lifecycle, tool reference',
        mimeType: 'text/markdown',
      },
    ],
  }))

  // List resource templates
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: 'datacore://journal/{date}',
        name: 'Journal Entry',
        description: 'Journal entry for a specific date (YYYY-MM-DD)',
        mimeType: 'text/markdown',
      },
      {
        uriTemplate: 'datacore://engrams/{id}',
        name: 'Engram',
        description: 'A specific engram by ID',
        mimeType: 'application/json',
      },
    ],
  }))

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri

    // Static: datacore://status
    if (uri === 'datacore://status') {
      const engrams = loadEngrams(storage.engramsPath)
      const active = engrams.filter(e => e.status === 'active').length
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ version: currentVersion, mode: storage.mode, engrams: engrams.length, active }),
        }],
      }
    }

    // Static: datacore://engrams/active
    if (uri === 'datacore://engrams/active') {
      const engrams = loadEngrams(storage.engramsPath).filter(e => e.status === 'active')
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(engrams, null, 2),
        }],
      }
    }

    // Static: datacore://guide
    if (uri === 'datacore://guide') {
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: AGENT_GUIDE,
        }],
      }
    }

    // Static or template: datacore://journal/today or datacore://journal/{date}
    const journalMatch = uri.match(/^datacore:\/\/journal\/(.+)$/)
    if (journalMatch) {
      const dateStr = journalMatch[1] === 'today' ? localDate().date : journalMatch[1]
      const filePath = path.join(storage.journalPath, `${dateStr}.md`)
      if (!fs.existsSync(filePath)) {
        return { contents: [{ uri, mimeType: 'text/markdown', text: `No journal entry for ${dateStr}` }] }
      }
      return { contents: [{ uri, mimeType: 'text/markdown', text: fs.readFileSync(filePath, 'utf8') }] }
    }

    // Template: datacore://engrams/{id}
    const engramMatch = uri.match(/^datacore:\/\/engrams\/(.+)$/)
    if (engramMatch) {
      const engrams = loadEngrams(storage.engramsPath)
      const engram = engrams.find(e => e.id === engramMatch[1])
      if (!engram) {
        throw new Error(`Engram not found: ${engramMatch[1]}`)
      }
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(engram, null, 2),
        }],
      }
    }

    throw new Error(`Unknown resource: ${uri}`)
  })
}

const AGENT_GUIDE = `# Datacore Agent Guide

## Use Proactively

Use Datacore tools automatically — do not wait to be asked:
- **session.start**: Call at the beginning of every conversation
- **learn**: Call when you discover patterns, preferences, insights, or corrections
- **feedback**: Call after engrams are injected to rate usefulness
- **session.end**: Call before the conversation ends

## Session Lifecycle
1. datacore.session.start — Get relevant engrams + today's context
2. Work on task, use datacore.recall or datacore.search as needed
3. datacore.feedback — Rate which injected engrams helped (batch supported)
4. datacore.session.end — Capture summary + engram suggestions

## Engram Lifecycle
- datacore.learn creates active engrams (immediately available for injection)
- datacore.feedback with positive signals strengthens injection priority
- datacore.forget retires engrams permanently
- Unused engrams naturally decay over time
- datacore.promote activates candidate engrams (when auto_promote is disabled)

## Quick Reference
| Tool | Purpose |
|------|---------|
| session.start | Begin session with context injection |
| session.end | End session with journal + engrams |
| learn | Create engram from knowledge statement |
| inject | Get relevant engrams for specific task |
| recall | Search all sources (engrams + journal + knowledge) |
| capture | Write journal entry or knowledge note |
| search | Keyword/semantic file search |
| ingest | Ingest text + extract engram suggestions |
| feedback | Rate engrams (single or batch) |
| forget | Retire an engram |
| status | System health + actionable recommendations |
| packs.discover | Browse available engram packs |
| packs.install | Install or upgrade a pack |
| packs.export | Export engrams as shareable pack |
| promote | Activate candidate engrams (when auto_promote disabled) |
`

export function notifyEngramsChanged(server: Server): void {
  try {
    server.sendResourceUpdated?.({ uri: 'datacore://engrams/active' })
  } catch { /* ignore if not supported */ }
}
