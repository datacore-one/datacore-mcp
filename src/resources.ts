// src/resources.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { localDate } from './tools/capture.js'
import { assertStorageCurrent, type StorageConfig } from './storage.js'
import { readTextWithin } from './safe-read.js'
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
        uri: 'datacore://journal/today',
        name: "Today's Journal",
        description: "Today's journal entry",
        mimeType: 'text/markdown',
      },
      {
        uri: 'datacore://guide',
        name: 'Datacore Agent Guide',
        description: 'Workflow guide for AI agents: capture, search, ingest, modules',
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
    ],
  }))

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    assertStorageCurrent(storage)
    const uri = request.params.uri

    // Static: datacore://status
    if (uri === 'datacore://status') {
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ version: currentVersion, mode: storage.mode }),
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(Date.parse(dateStr))
        || new Date(dateStr).toISOString().slice(0, 10) !== dateStr) throw new Error('Invalid journal date')
      if (!storage.journalPath) throw new Error('No unambiguous personal journal is configured')
      const filePath = path.join(storage.journalPath, `${dateStr}.md`)
      const text = readTextWithin(storage.basePath, filePath)
      if (text === null) {
        return { contents: [{ uri, mimeType: 'text/markdown', text: `No journal entry for ${dateStr}` }] }
      }
      return { contents: [{ uri, mimeType: 'text/markdown', text }] }
    }

    throw new Error(`Unknown resource: ${uri}`)
  })
}

const AGENT_GUIDE = `# Datacore Agent Guide

## Datacore Tools

Datacore is a productivity system for journal entries, knowledge files, and module management.

| Tool | Purpose |
|------|---------|
| capture | Write a journal entry or knowledge note |
| search | Search journal and knowledge files |
| ingest | Import text content as a knowledge note |
| status | System health and recommendations |
| modules.list | List installed modules |
| modules.info | Module details |
| modules.health | Module health check |

## Memory Tools

For memory (engrams, learning, recall), use PLUR MCP tools:
- plur_session_start — begin session with context injection
- plur_learn — record a reusable learning
- plur_recall — search engram memory
- plur_feedback — rate engram usefulness
- plur_session_end — end session, capture learnings
`
