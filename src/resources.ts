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

export function notifyEngramsChanged(server: Server): void {
  try {
    server.sendResourceUpdated?.({ uri: 'datacore://engrams/active' })
  } catch { /* ignore if not supported */ }
}
