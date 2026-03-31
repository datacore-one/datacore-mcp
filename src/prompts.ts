// src/prompts.ts
// MCP Prompts — server-suggested workflows that any MCP client can discover and use.

import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

interface PromptDef {
  name: string
  title: string
  description: string
  arguments?: Array<{ name: string; description: string; required?: boolean }>
  messages: (args: Record<string, string>) => Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>
}

const PROMPTS: PromptDef[] = [
  {
    name: 'datacore-capture',
    title: 'Capture to Datacore',
    description: 'Write a journal entry or knowledge note to Datacore.',
    arguments: [
      { name: 'type', description: 'Type of capture: journal or knowledge', required: false },
    ],
    messages: (args) => [{
      role: 'user',
      content: {
        type: 'text',
        text: `Capture content to Datacore.${args.type ? ` Type: ${args.type}` : ''}

Call datacore.capture to write a journal entry or knowledge note.

Available tools:
- datacore.capture — write journal entries and knowledge notes
- datacore.search — find information in journal and knowledge files
- datacore.ingest — import content into your knowledge base
- datacore.status — check system health
- datacore.modules.* — manage installed modules

For memory (engrams, learning, recall): use PLUR MCP tools.`,
      },
    }],
  },
  {
    name: 'datacore-guide',
    title: 'How to use Datacore',
    description: 'Guide to Datacore tools and workflows.',
    messages: () => [{
      role: 'assistant',
      content: {
        type: 'text',
        text: `# Datacore — Productivity System

Datacore manages journal entries, knowledge files, and modules.

## Tools

| Tool | What it does |
|------|-------------|
| **capture** | Write a journal entry or knowledge note |
| **search** | Search journal and knowledge files |
| **ingest** | Import text as a knowledge note |
| **status** | System health + recommendations |
| **modules.list** | List installed modules |
| **modules.info** | Module details |
| **modules.health** | Module health check |

## Memory

For persistent memory (engrams, learning, recall), use PLUR MCP tools:
- plur_session_start, plur_session_end
- plur_learn, plur_recall, plur_inject
- plur_feedback, plur_forget

## Data Storage

All data is in plain text files:
- \`journal/\` — Daily session logs (YYYY-MM-DD.md)
- \`knowledge/\` — Ingested reference material
- \`config.yaml\` — Configuration`,
      },
    }],
  },
]

export function registerPrompts(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map(p => ({
      name: p.name,
      title: p.title,
      description: p.description,
      arguments: p.arguments,
    })),
  }))

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params
    const prompt = PROMPTS.find(p => p.name === name)
    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`)
    }
    return {
      description: prompt.description,
      messages: prompt.messages(promptArgs ?? {}),
    }
  })
}
