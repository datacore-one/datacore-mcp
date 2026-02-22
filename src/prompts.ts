// src/prompts.ts
// MCP Prompts — server-suggested workflows that any MCP client can discover and use.
// This is the primary bootstrap mechanism: when an AI connects, it can list these
// prompts to understand how to use Datacore effectively.

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
    name: 'datacore-session',
    title: 'Start a Datacore session',
    description: 'Begin a working session with Datacore. Injects relevant context, shows today\'s journal, and guides you through the session lifecycle.',
    arguments: [
      { name: 'task', description: 'What you are working on (optional — triggers engram injection)', required: false },
    ],
    messages: (args) => [{
      role: 'user',
      content: {
        type: 'text',
        text: `Start a new Datacore session.${args.task ? ` Task: ${args.task}` : ''}

Call datacore.session.start${args.task ? ` with task: "${args.task}"` : ''} to begin. This will:
- Inject relevant engrams (learned knowledge) for the task
- Show today's journal entry if one exists
- List any candidate engrams awaiting review

When done working, call datacore.session.end with a summary and any new learnings.

Session lifecycle:
1. datacore.session.start → get context
2. Work on task (use datacore.recall or datacore.search as needed)
3. datacore.feedback → rate which injected engrams were helpful
4. datacore.session.end → capture summary + new engrams`,
      },
    }],
  },
  {
    name: 'datacore-learn',
    title: 'Teach Datacore something',
    description: 'Record a reusable learning as an engram. Covers the full engram lifecycle: create, review, activate, reinforce.',
    arguments: [
      { name: 'statement', description: 'The knowledge to record (e.g., "Always run tests before deploying")', required: true },
    ],
    messages: (args) => [{
      role: 'user',
      content: {
        type: 'text',
        text: `Record this learning in Datacore: "${args.statement || '...'}"

Call datacore.learn with the statement. This creates a candidate engram.

Engram lifecycle:
1. datacore.learn → creates candidate (not yet active)
2. datacore.promote → activates it so it appears in future inject results
3. datacore.inject → retrieves relevant engrams when working on tasks
4. datacore.feedback → positive signals strengthen it, negative signals weaken it
5. datacore.forget → retires it permanently if no longer useful

Engrams that prove useful get reinforced over time. Unused ones naturally decay.`,
      },
    }],
  },
  {
    name: 'datacore-guide',
    title: 'How to use Datacore',
    description: 'Complete guide to Datacore tools, workflows, and concepts. Read this to understand the system.',
    messages: () => [{
      role: 'assistant',
      content: {
        type: 'text',
        text: `# Datacore — Persistent Memory for AI

Datacore gives you persistent memory through **engrams** — typed knowledge units that get injected into context when relevant. You learn patterns, remember preferences, and build on previous work across sessions.

## Use Proactively

Use Datacore tools automatically — do not wait to be asked:
- **session.start**: Call at the beginning of every conversation
- **learn**: Call when you discover patterns, preferences, insights, or corrections
- **feedback**: Call after engrams are injected to rate usefulness
- **session.end**: Call before the conversation ends

## Core Concepts

**Engrams** are reusable knowledge: "Always validate input at API boundaries", "User prefers tabs over spaces". They have activation dynamics — frequently useful ones get stronger, unused ones decay.

**Journal** is your session log. Each session captures what happened, what was learned.

**Knowledge** is ingested reference material — articles, notes, documents broken into searchable pieces.

## Session Workflow

Every session follows this pattern:

1. **datacore.session.start** — Injects relevant engrams + shows today's journal
2. **Work** — Use datacore.recall or datacore.search to find information
3. **datacore.feedback** — Rate which engrams were helpful (strengthens good ones)
4. **datacore.session.end** — Capture summary + suggest new engrams

## Tool Reference

### Session
| Tool | What it does |
|------|-------------|
| **session.start** | Begin session, inject context, show journal |
| **session.end** | End session, capture journal + new engrams |

### Core
| Tool | What it does |
|------|-------------|
| **capture** | Write a journal entry or knowledge note |
| **learn** | Create an engram (immediately active) |
| **inject** | Get relevant engrams for a specific task |
| **recall** | Search everything (engrams + journal + knowledge) |
| **search** | Search journal and knowledge files |
| **ingest** | Ingest text, extract engram suggestions |
| **status** | System health + actionable recommendations |

### Engram Management
| Tool | What it does |
|------|-------------|
| **feedback** | Rate engrams: positive/negative/neutral (single or batch) |
| **forget** | Retire an engram permanently |
| **promote** | Activate candidate engrams (when auto_promote disabled) |

### Packs (Shareable Knowledge)
| Tool | What it does |
|------|-------------|
| **packs.discover** | Browse available engram packs |
| **packs.install** | Install a pack |
| **packs.export** | Export your engrams as a pack |

## Engram Lifecycle

\`\`\`
learn → active → inject → feedback → stronger/weaker → forget (retire)
\`\`\`

- **active**: Appears in inject results when relevant. Created directly by learn.
- **retired**: Permanently removed from injection.

Feedback matters: positive signals increase retrieval strength, negative signals decrease it. Engrams that are never accessed naturally decay over time.

## Tips

- Start every session with **session.start** — it gives you relevant context
- End every session with **session.end** — it captures what you learned
- Call **learn** proactively when you discover patterns or preferences
- Use **feedback** after getting injected engrams — this is how Datacore learns what's useful
- Use **recall** for broad searches across all sources, **search** for targeted file searches
- Check **status** periodically — it shows actionable recommendations`,
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
