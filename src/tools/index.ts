// src/tools/index.ts
import { z } from 'zod'

export const TOOLS = [
  {
    name: 'datacore_capture',
    description: 'Capture a journal entry or knowledge note. Call proactively to record important decisions, meeting outcomes, and significant events.',
    inputSchema: z.object({
      type: z.enum(['journal', 'knowledge']),
      content: z.string().describe('Content to capture'),
      title: z.string().optional().describe('Title for knowledge notes'),
      tags: z.array(z.string()).optional().describe('Tags to attach'),
    }),
  },
  {
    name: 'datacore_search',
    description: 'Search journal entries and knowledge notes by keyword',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      scope: z.enum(['journal', 'knowledge', 'all']).optional(),
      method: z.enum(['keyword', 'semantic']).optional().describe('Search method (default: keyword)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    }),
  },
  {
    name: 'datacore_ingest',
    description: 'Ingest text content as a knowledge note',
    inputSchema: z.object({
      content: z.string().describe('Content to ingest'),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
  {
    name: 'datacore_status',
    description: 'Show Datacore status: note counts, module health, update info',
    inputSchema: z.object({}),
  },
  {
    name: 'datacore_date',
    description: 'Canonical date operations — ALWAYS use this instead of typing dates from memory. LLMs hallucinate day-of-week names and anchor to training-era dates. Returns today\'s date, validates day-of-week, adds/subtracts days, parses relative expressions, and formats org-mode timestamps.',
    inputSchema: z.object({
      op: z.enum(['today', 'dow', 'validate', 'add', 'sub', 'diff', 'parse', 'org-stamp']).describe('Operation: today (current date+dow), dow (day-of-week for a date), validate (check date matches claimed dow), add/sub (N days from date), diff (days between two dates), parse (relative expression like "next monday"), org-stamp (<YYYY-MM-DD Day>)'),
      date: z.string().optional().describe('ISO date YYYY-MM-DD (for dow/validate/add/sub/org-stamp)'),
      date2: z.string().optional().describe('Second date for diff'),
      day: z.string().optional().describe('Claimed day name (Mon..Sun) for validate'),
      n: z.number().optional().describe('Number of days for add/sub'),
      expr: z.string().optional().describe('Relative expression for parse (e.g. "tomorrow", "next monday", "in 3 days")'),
      inactive: z.boolean().optional().describe('For org-stamp: use [..] instead of <..>'),
    }),
  },
  {
    name: 'datacore_modules_list',
    description: 'List installed modules with scope, version, and capability counts',
    inputSchema: z.object({}),
  },
  {
    name: 'datacore_modules_info',
    description: 'Get detailed info about a specific module: manifest, tools, skills, agents',
    inputSchema: z.object({
      module: z.string().describe('Module name (e.g., "gtd", "slides", "crm")'),
    }),
  },
  {
    name: 'datacore_modules_health',
    description: 'Check module health: missing files, env vars, data separation issues',
    inputSchema: z.object({
      module: z.string().optional().describe('Module name (omit for all modules)'),
    }),
  },
] as const
