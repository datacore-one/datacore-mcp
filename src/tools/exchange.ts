// src/tools/exchange.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { loadEngrams, saveEngrams } from '../engrams.js'
import { createLEPPacket, validateLEPPacket, importLEPEngrams } from '../exchange.js'
import { buildHints } from '../hints.js'
import type { EngagementService } from '../engagement/index.js'

interface ExchangeArgs {
  action: 'export' | 'import' | 'status'
  engram_ids?: string[]
  filter_domain?: string
  path?: string
  sender?: string
  confirm?: boolean
  fitness_threshold?: number
  source_cap_percent?: number
}

export async function handleExchange(
  args: ExchangeArgs,
  paths: { engramsPath: string; exchangeInboxPath: string; exchangeOutboxPath: string },
  engagementService?: EngagementService,
): Promise<unknown> {
  switch (args.action) {
    case 'export': return exportAction(args, paths, engagementService)
    case 'import': return importAction(args, paths)
    case 'status': return statusAction(paths)
    default: throw new Error(`Unknown exchange action: ${args.action}`)
  }
}

async function exportAction(
  args: ExchangeArgs,
  paths: { engramsPath: string; exchangeOutboxPath: string },
  engagementService?: EngagementService,
) {
  const allEngrams = loadEngrams(paths.engramsPath)
  const sender = args.sender ?? 'anonymous'

  // Filter engrams for export
  let candidates = allEngrams.filter(e =>
    !e.pack &&
    e.status === 'active' &&
    (e.visibility === 'public' || e.visibility === 'template'),
  )

  if (args.engram_ids?.length) {
    const idSet = new Set(args.engram_ids)
    candidates = candidates.filter(e => idSet.has(e.id))
  }
  if (args.filter_domain) {
    candidates = candidates.filter(e => e.domain?.startsWith(args.filter_domain!))
  }

  if (candidates.length === 0) {
    return {
      exported: 0,
      message: 'No eligible engrams found. Only public/template visibility engrams can be exported.',
      _hints: buildHints({ next: 'Set visibility to public or template on engrams you want to share.', related: ['datacore.learn'] }),
    }
  }

  const packet = createLEPPacket(candidates, allEngrams, sender)

  // Ensure outbox dir exists
  fs.mkdirSync(paths.exchangeOutboxPath, { recursive: true })
  const outPath = path.join(paths.exchangeOutboxPath, `${packet.id}.yaml`)
  fs.writeFileSync(outPath, yaml.dump(packet, { lineWidth: 120, noRefs: true, quotingType: '"' }))

  // Engagement XP
  if (engagementService?.isEnabled()) {
    try { await engagementService.award('pack_exported', { count: packet.engrams.length }) } catch { /* */ }
  }

  return {
    exported: packet.engrams.length,
    packet_id: packet.id,
    path: outPath,
    _hints: buildHints({ next: `Exported ${packet.engrams.length} engram(s) to ${outPath}`, related: ['datacore.exchange'] }),
  }
}

async function importAction(
  args: ExchangeArgs,
  paths: { engramsPath: string; exchangeInboxPath: string },
) {
  if (!args.path) throw new Error('path is required for import action')
  if (!fs.existsSync(args.path)) throw new Error(`File not found: ${args.path}`)

  const raw = yaml.load(fs.readFileSync(args.path, 'utf8'))
  const packet = validateLEPPacket(raw)
  const existing = loadEngrams(paths.engramsPath)

  const result = importLEPEngrams(packet, existing, {
    fitnessThreshold: args.fitness_threshold,
    sourceCapPercent: args.source_cap_percent,
  })

  if (result.skipped_source_cap) {
    return {
      imported: 0,
      message: `Source cap exceeded: too many engrams already from ${packet.sender}.`,
      _hints: buildHints({ next: 'Remove some imported engrams from this source first.', related: ['datacore.forget'] }),
    }
  }

  if (args.confirm && result.imported > 0) {
    saveEngrams(paths.engramsPath, existing)
    return {
      imported: result.imported,
      skipped_fitness: result.skipped_fitness,
      skipped_duplicate: result.skipped_duplicate,
      candidates: result.candidates,
      _hints: buildHints({
        next: `Imported ${result.imported} engram(s) as candidates. Use datacore.promote to activate.`,
        related: ['datacore.promote'],
      }),
    }
  }

  return {
    action: 'preview',
    would_import: result.imported,
    skipped_fitness: result.skipped_fitness,
    skipped_duplicate: result.skipped_duplicate,
    candidates: result.candidates,
    _hints: buildHints({
      next: result.imported > 0
        ? `Preview: ${result.imported} engram(s) would be imported. Set confirm=true to execute.`
        : 'No engrams passed fitness and duplicate filters.',
      related: ['datacore.exchange'],
    }),
  }
}

function statusAction(
  paths: { exchangeInboxPath: string; exchangeOutboxPath: string },
) {
  const inboxCount = countYamlFiles(paths.exchangeInboxPath)
  const outboxCount = countYamlFiles(paths.exchangeOutboxPath)

  return {
    inbox: inboxCount,
    outbox: outboxCount,
    _hints: buildHints({
      next: inboxCount > 0
        ? `${inboxCount} packet(s) in inbox. Use action="import" with path to process.`
        : 'No packets in inbox.',
      related: ['datacore.exchange'],
    }),
  }
}

function countYamlFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).length
}
