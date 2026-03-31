// src/tools/index.ts
import { z } from 'zod'

export const TOOLS = [
  {
    name: 'datacore.capture',
    description: 'Capture a journal entry or knowledge note. Call proactively to record important decisions, meeting outcomes, and significant events.',
    inputSchema: z.object({
      type: z.enum(['journal', 'knowledge']),
      content: z.string().describe('Content to capture'),
      title: z.string().optional().describe('Title for knowledge notes'),
      tags: z.array(z.string()).optional().describe('Tags to attach'),
    }),
  },
  {
    name: 'datacore.search',
    description: 'Search journal entries and knowledge notes by keyword',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      scope: z.enum(['journal', 'knowledge', 'all']).optional(),
      method: z.enum(['keyword', 'semantic']).optional().describe('Search method (default: keyword)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    }),
  },
  {
    name: 'datacore.ingest',
    description: 'Ingest text content as a knowledge note',
    inputSchema: z.object({
      content: z.string().describe('Content to ingest'),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
  {
    name: 'datacore.status',
    description: 'Show Datacore status: note counts, module health, update info',
    inputSchema: z.object({}),
  },
  {
    name: 'datacore.modules.list',
    description: 'List installed modules with scope, version, and capability counts',
    inputSchema: z.object({}),
  },
  {
    name: 'datacore.modules.info',
    description: 'Get detailed info about a specific module: manifest, tools, skills, agents',
    inputSchema: z.object({
      module: z.string().describe('Module name (e.g., "gtd", "slides", "crm")'),
    }),
  },
  {
    name: 'datacore.modules.health',
    description: 'Check module health: missing files, env vars, data separation issues',
    inputSchema: z.object({
      module: z.string().optional().describe('Module name (omit for all modules)'),
    }),
  },
] as const
