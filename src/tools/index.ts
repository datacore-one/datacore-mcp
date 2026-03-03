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
    name: 'datacore.learn',
    description: 'Create an engram from a statement — record a reusable learning. Call proactively when you discover patterns, user preferences, project conventions, debugging insights, or corrections worth remembering across sessions.',
    inputSchema: z.object({
      statement: z.string().describe('The knowledge assertion'),
      type: z.enum(['behavioral', 'terminological', 'procedural', 'architectural']).optional(),
      scope: z.string().optional().describe('Scope: global | agent:X | command:X'),
      tags: z.array(z.string()).optional(),
      domain: z.string().optional().describe('Dot-notation domain: software.architecture'),
      visibility: z.enum(['private', 'public', 'template']).optional(),
      knowledge_anchors: z.array(z.object({
        path: z.string().describe('Path to related document (e.g., zettel/Data-Pricing.md)'),
        relevance: z.enum(['primary', 'supporting', 'example']).optional().describe('Anchor relevance level'),
        snippet: z.string().optional().describe('Short snippet from the document (max 200 chars)'),
        snippet_extracted_at: z.string().optional().describe('ISO date when snippet was extracted'),
      })).optional().describe('Links to related knowledge documents'),
      dual_coding: z.object({
        example: z.string().optional().describe('Concrete example illustrating the engram'),
        analogy: z.string().optional().describe('Analogy to aid understanding'),
      }).optional().describe('Dual coding: example and/or analogy for richer encoding'),
    }),
  },
  {
    name: 'datacore.inject',
    description: 'Get relevant engrams for a task — returns directives and considerations. Called automatically by session.start; call directly for mid-session context on a new topic.',
    inputSchema: z.object({
      prompt: z.string().describe('The task or question to match against'),
      scope: z.string().optional().describe('Filter by scope: global | agent:X | module:X | command:X'),
      session_id: z.string().optional().describe('Session ID for co-access tracking (from session.start)'),
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
      method: z.enum(['keyword', 'semantic']).optional().describe('Search method (default: keyword)'),
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
    name: 'datacore.packs.discover',
    description: 'Browse available engram packs from the registry',
    inputSchema: z.object({
      query: z.string().optional().describe('Filter by name/description'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
    }),
  },
  {
    name: 'datacore.packs.install',
    description: 'Install or upgrade an engram pack',
    inputSchema: z.object({
      source: z.string().describe('Pack source: local path or pack ID from registry'),
    }),
  },
  {
    name: 'datacore.forget',
    description: 'Retire an engram by ID or search term — marks it as retired so it is no longer injected',
    inputSchema: z.object({
      id: z.string().optional().describe('Exact engram ID to retire (e.g., ENG-2026-0219-001)'),
      search: z.string().optional().describe('Search term to find engram by statement, tag, or ID fragment'),
    }),
  },
  {
    name: 'datacore.feedback',
    description: 'Signal whether an injected engram was helpful (positive), unhelpful (negative), or seen but not acted on (neutral). Always call after session.start injects engrams — this trains the system. Supports single or batch mode.',
    inputSchema: z.object({
      engram_id: z.string().optional().describe('The engram ID to provide feedback on (single mode)'),
      signal: z.enum(['positive', 'negative', 'neutral']).optional().describe('Feedback signal (single mode)'),
      signals: z.array(z.object({
        engram_id: z.string().describe('Engram ID'),
        signal: z.enum(['positive', 'negative', 'neutral']).describe('Feedback signal'),
      })).optional().describe('Batch feedback signals'),
      comment: z.string().optional().describe('Optional comment about why'),
    }).refine(data => (data.engram_id && data.signal) || (data.signals && data.signals.length > 0), {
      message: 'Either (engram_id + signal) or signals array required',
    }),
  },
  {
    name: 'datacore.packs.export',
    description: 'Export personal engrams as a shareable pack. Preview by default, set confirm=true to write.',
    inputSchema: z.object({
      name: z.string().describe('Pack name'),
      description: z.string().describe('Pack description'),
      engram_ids: z.array(z.string()).optional().describe('Specific engram IDs to export'),
      filter_tags: z.array(z.string()).optional().describe('Filter by tags'),
      filter_domain: z.string().optional().describe('Filter by domain prefix'),
      confirm: z.boolean().optional().describe('Set true to write pack (default: preview only)'),
    }),
  },
  {
    name: 'datacore.session.start',
    description: 'Start here. Call this at the beginning of every session to get relevant context, today\'s journal, and a guide to all available tools.',
    inputSchema: z.object({
      task: z.string().optional().describe('What you are working on (triggers engram injection)'),
      tags: z.array(z.string()).optional().describe('Tags to filter injected engrams'),
    }),
  },
  {
    name: 'datacore.session.end',
    description: 'End a session — captures journal summary and creates engrams from suggestions. Call before the conversation ends to preserve what was learned.',
    inputSchema: z.object({
      summary: z.string().describe('Session summary for the journal'),
      session_id: z.string().optional().describe('Session ID from session.start (for co-access tracking)'),
      tags: z.array(z.string()).optional().describe('Tags for the journal entry'),
      engram_suggestions: z.array(z.object({
        statement: z.string().describe('The knowledge assertion'),
        type: z.enum(['behavioral', 'terminological', 'procedural', 'architectural']).optional(),
      })).optional().describe('Engrams to create from this session'),
    }),
  },
  {
    name: 'datacore.recall',
    description: 'Search all sources (engrams, journal, knowledge) for a topic — results grouped by source',
    inputSchema: z.object({
      topic: z.string().describe('What to search for'),
      sources: z.array(z.enum(['engrams', 'journal', 'knowledge'])).optional().describe('Which sources to search (default: all)'),
      limit: z.number().optional().describe('Max results per source (default: 10)'),
    }),
  },
  {
    name: 'datacore.promote',
    description: 'Activate candidate engrams so they appear in inject results',
    inputSchema: z.object({
      id: z.string().optional().describe('Single engram ID to promote'),
      ids: z.array(z.string()).optional().describe('Multiple engram IDs to promote'),
    }).refine(data => data.id || (data.ids && data.ids.length > 0), {
      message: 'At least one engram ID required (id or ids)',
    }),
  },
  {
    name: 'datacore.modules.list',
    description: 'List installed modules with scope, version, and capability counts',
    inputSchema: z.object({}),
  },
  {
    name: 'datacore.modules.info',
    description: 'Get detailed info about a specific module: manifest, tools, skills, agents, engrams',
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
  {
    name: 'datacore.resolve',
    description: 'Resolve a pending engagement event: reconsolidation (contradiction challenge), discovery (cross-domain insight), or challenge (weekly goal). The agent presents options to the user and calls this with their choice.',
    inputSchema: z.object({
      type: z.enum(['reconsolidation', 'discovery', 'challenge']).describe('Type of event to resolve'),
      id: z.string().describe('Event ID (engram_id, discovery_id, or challenge_id)'),
      action: z.string().describe('Resolution action: defend|revise|retire|dismiss (recon), explore|note (discovery), dismiss (challenge)'),
      revised_statement: z.string().optional().describe('New statement text (required when action is "revise")'),
    }),
  },
] as const
