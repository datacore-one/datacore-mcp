// src/tools/commands.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { StorageConfig } from '../storage.js'

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns { frontmatter, body } or null if no frontmatter.
 */
function parseFrontmatter(filePath: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const content = readFileSync(filePath, 'utf-8')
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!fmMatch) return null

  // Simple YAML parse — handle key: value, arrays, and multi-line strings
  const frontmatter: Record<string, unknown> = {}
  const lines = fmMatch[1].split('\n')
  let currentKey = ''
  let inArray = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (line.startsWith('  - ') && inArray) {
      const arr = (frontmatter[currentKey] as string[]) ?? []
      arr.push(trimmed.slice(2))
      frontmatter[currentKey] = arr
      continue
    }

    const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      const [, key, value] = kvMatch
      currentKey = key
      if (value === '' || value === undefined) {
        inArray = true
        frontmatter[key] = []
      } else {
        inArray = false
        // Strip quotes
        frontmatter[key] = value.replace(/^["']|["']$/g, '')
      }
    }
  }

  return { frontmatter, body: fmMatch[2] }
}

/**
 * Discover all commands in .datacore/commands/ (full mode only).
 */
export function discoverCommands(storage: StorageConfig): CommandInfo[] {
  const commandsDir = join(storage.basePath, '.datacore', 'commands')
  if (!existsSync(commandsDir)) return []

  const results: CommandInfo[] = []

  for (const entry of readdirSync(commandsDir)) {
    if (!entry.endsWith('.md')) continue
    const filePath = join(commandsDir, entry)
    if (!statSync(filePath).isFile()) continue

    const name = basename(entry, '.md')
    const parsed = parseFrontmatter(filePath)

    results.push({
      name,
      description: (parsed?.frontmatter.description as string) ?? `${name} command`,
      userInvocable: parsed?.frontmatter.user_invocable !== false,
      source: filePath,
    })
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

export interface CommandInfo {
  name: string
  description: string
  userInvocable: boolean
  source: string
}

/**
 * Handle datacore_command_list — list available commands.
 */
export function handleCommandList(_args: Record<string, unknown>, storage: StorageConfig) {
  const commands = discoverCommands(storage)
  return {
    count: commands.length,
    commands: commands.map(c => ({
      name: c.name,
      description: c.description,
      user_invocable: c.userInvocable,
    })),
    _hints: {
      next: `Call datacore_command_run with a command name to get its full instructions.`,
      related: ['datacore_command_run'],
    },
  }
}

/**
 * Handle datacore_command_run — load a command's full instructions.
 * Returns the complete markdown body (after frontmatter) as instructions
 * for the AI agent to execute.
 */
export function handleCommandRun(args: { command: string }, storage: StorageConfig) {
  const commandsDir = join(storage.basePath, '.datacore', 'commands')
  const filePath = join(commandsDir, `${args.command}.md`)

  if (!existsSync(filePath)) {
    // Suggest closest matches
    const all = discoverCommands(storage)
    const suggestions = all
      .map(c => ({ name: c.name, dist: levenshtein(args.command.toLowerCase(), c.name.toLowerCase()) }))
      .filter(s => s.dist <= Math.max(3, Math.floor(args.command.length * 0.4)))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
      .map(s => s.name)

    const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''
    throw new Error(`Unknown command: ${args.command}.${hint}`)
  }

  const parsed = parseFrontmatter(filePath)
  const body = parsed?.body ?? readFileSync(filePath, 'utf-8')

  return {
    command: args.command,
    description: (parsed?.frontmatter.description as string) ?? `${args.command} command`,
    instructions: body,
    source: filePath,
  }
}

// --- Agent discovery (same pattern) ---

/**
 * Discover all agents in .datacore/agents/ (full mode only).
 */
export function discoverAgents(storage: StorageConfig): AgentInfo[] {
  const agentsDir = join(storage.basePath, '.datacore', 'agents')
  if (!existsSync(agentsDir)) return []

  const results: AgentInfo[] = []

  for (const entry of readdirSync(agentsDir)) {
    if (!entry.endsWith('.md')) continue
    const filePath = join(agentsDir, entry)
    if (!statSync(filePath).isFile()) continue

    const name = basename(entry, '.md')
    const parsed = parseFrontmatter(filePath)

    results.push({
      name,
      description: (parsed?.frontmatter.description as string) ?? `${name} agent`,
      model: (parsed?.frontmatter.model as string) ?? 'inherit',
      source: filePath,
    })
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

export interface AgentInfo {
  name: string
  description: string
  model: string
  source: string
}

/**
 * Handle datacore_agent_list — list available agents.
 */
export function handleAgentList(_args: Record<string, unknown>, storage: StorageConfig) {
  const agents = discoverAgents(storage)
  return {
    count: agents.length,
    agents: agents.map(a => ({
      name: a.name,
      description: a.description,
      model: a.model,
    })),
    _hints: {
      next: `Call datacore_agent_run with an agent name to get its full prompt.`,
      related: ['datacore_agent_run'],
    },
  }
}

/**
 * Handle datacore_agent_run — load an agent's full prompt.
 */
export function handleAgentRun(args: { agent: string }, storage: StorageConfig) {
  const agentsDir = join(storage.basePath, '.datacore', 'agents')
  const filePath = join(agentsDir, `${args.agent}.md`)

  if (!existsSync(filePath)) {
    const all = discoverAgents(storage)
    const suggestions = all
      .map(a => ({ name: a.name, dist: levenshtein(args.agent.toLowerCase(), a.name.toLowerCase()) }))
      .filter(s => s.dist <= Math.max(3, Math.floor(args.agent.length * 0.4)))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
      .map(s => s.name)

    const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''
    throw new Error(`Unknown agent: ${args.agent}.${hint}`)
  }

  const parsed = parseFrontmatter(filePath)
  const body = parsed?.body ?? readFileSync(filePath, 'utf-8')

  return {
    agent: args.agent,
    description: (parsed?.frontmatter.description as string) ?? `${args.agent} agent`,
    model: (parsed?.frontmatter.model as string) ?? 'inherit',
    prompt: body,
    source: filePath,
  }
}

// --- Utils ---

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}
