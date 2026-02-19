// src/tools/index.ts
import { z } from 'zod'

export const TOOLS = [
  {
    name: 'datacore.capture',
    description: 'Capture a journal entry or knowledge note',
    inputSchema: z.object({
      type: z.enum(['journal', 'knowledge']),
      content: z.string().describe('Content to capture'),
      title: z.string().optional().describe('Title for knowledge notes'),
      tags: z.array(z.string()).optional().describe('Tags to attach'),
    }),
  },
  {
    name: 'datacore.learn',
    description: 'Create an engram from a statement — record a reusable learning',
    inputSchema: z.object({
      statement: z.string().describe('The knowledge assertion'),
      type: z.enum(['behavioral', 'terminological', 'procedural', 'architectural']).optional(),
      scope: z.string().optional().describe('Scope: global | agent:X | command:X'),
      tags: z.array(z.string()).optional(),
      domain: z.string().optional().describe('Dot-notation domain: software.architecture'),
      visibility: z.enum(['private', 'public', 'template']).optional(),
    }),
  },
  {
    name: 'datacore.inject',
    description: 'Get relevant engrams for a task — returns directives and considerations',
    inputSchema: z.object({
      prompt: z.string().describe('The task or question to match against'),
      max_tokens: z.number().optional().describe('Token budget (default: 8000)'),
      min_relevance: z.number().optional().describe('Minimum score threshold (default: 0.3)'),
    }),
  },
  {
    name: 'datacore.search',
    description: 'Search journal entries and knowledge notes by keyword',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      scope: z.enum(['journal', 'knowledge', 'all']).optional(),
      limit: z.number().optional().describe('Max results (default: 20)'),
    }),
  },
  {
    name: 'datacore.ingest',
    description: 'Ingest text content as a knowledge note, optionally extract engram suggestions',
    inputSchema: z.object({
      content: z.string().describe('Content to ingest'),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
  {
    name: 'datacore.status',
    description: 'Show Datacore status: engram/pack/note counts, scaling hints, update info',
    inputSchema: z.object({}),
  },
  {
    name: 'datacore.discover',
    description: 'Browse available engram packs from the registry',
    inputSchema: z.object({
      query: z.string().optional().describe('Filter by name/description'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
    }),
  },
  {
    name: 'datacore.install',
    description: 'Install or upgrade an engram pack',
    inputSchema: z.object({
      source: z.string().describe('Pack source: local path or pack ID from registry'),
    }),
  },
] as const
