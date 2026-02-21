// src/tools/export.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { loadEngrams } from '../engrams.js'
import type { Engram } from '../schemas/engram.js'

interface ExportArgs {
  name: string
  description: string
  engram_ids?: string[]
  filter_tags?: string[]
  filter_domain?: string
  confirm?: boolean
}

interface ExportResult {
  success: boolean
  preview?: {
    count: number
    statements: string[]
    pack_path: string
  }
  pack_path?: string
  error?: string
}

export async function handleExport(
  args: ExportArgs,
  paths: { engramsPath: string; packsPath: string },
): Promise<ExportResult> {
  const allEngrams = loadEngrams(paths.engramsPath)
  let selected = allEngrams.filter(e => e.status === 'active')

  // Only include public or template engrams
  selected = selected.filter(e => e.visibility === 'public' || e.visibility === 'template')

  if (selected.length === 0 && !args.engram_ids?.length) {
    return { success: false, error: 'No exportable engrams found (only public/template engrams can be exported)' }
  }

  // Apply filters
  if (args.engram_ids?.length) {
    const idSet = new Set(args.engram_ids)
    // For explicit IDs, still filter for public/template from allEngrams
    selected = allEngrams.filter(e =>
      idSet.has(e.id) &&
      e.status === 'active' &&
      (e.visibility === 'public' || e.visibility === 'template')
    )
    const privateSkipped = args.engram_ids.filter(id => {
      const e = allEngrams.find(eng => eng.id === id)
      return e && e.visibility === 'private'
    })
    if (privateSkipped.length > 0) {
      return { success: false, error: `Cannot export private engrams: ${privateSkipped.join(', ')}. Set visibility to public or template first.` }
    }
  }

  if (args.filter_tags?.length) {
    const tagSet = new Set(args.filter_tags.map(t => t.toLowerCase()))
    selected = selected.filter(e => e.tags.some(t => tagSet.has(t.toLowerCase())))
  }

  if (args.filter_domain) {
    selected = selected.filter(e => e.domain?.startsWith(args.filter_domain!))
  }

  if (selected.length === 0) {
    return { success: false, error: 'No engrams match the filter criteria' }
  }

  const packId = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
  const packDir = path.join(paths.packsPath, packId)

  // Preview mode (default)
  if (!args.confirm) {
    return {
      success: true,
      preview: {
        count: selected.length,
        statements: selected.map(e => e.statement).slice(0, 10),
        pack_path: packDir,
      },
    }
  }

  // Check for existing pack
  if (fs.existsSync(packDir)) {
    return {
      success: false,
      error: `Pack directory already exists at ${packDir}. Remove it first or use a different name.`,
    }
  }

  // Write pack
  fs.mkdirSync(packDir, { recursive: true })

  // SKILL.md with frontmatter
  const skillContent = `---
name: "${args.name}"
description: "${args.description}"
version: "1.0.0"
schema_version: 2
x-datacore:
  id: "${packId}"
  injection_policy: on_match
  match_terms: []
  engram_count: ${selected.length}
---

# ${args.name}

${args.description}

Exported ${selected.length} engrams.
`
  fs.writeFileSync(path.join(packDir, 'SKILL.md'), skillContent)

  // engrams.yaml — strip personal fields, preserve knowledge content
  const exportEngrams = selected.map(e => ({
    id: e.id,
    version: e.version,
    type: e.type,
    scope: e.scope,
    visibility: e.visibility,
    statement: e.statement,
    rationale: e.rationale,
    contraindications: e.contraindications,
    tags: e.tags,
    domain: e.domain,
    status: 'active',
    activation: {
      retrieval_strength: 0.7,
      storage_strength: 1.0,
      frequency: 0,
      last_accessed: new Date().toISOString().split('T')[0],
    },
    feedback_signals: { positive: 0, negative: 0 },
  }))

  fs.writeFileSync(
    path.join(packDir, 'engrams.yaml'),
    yaml.dump({ engrams: exportEngrams }, { lineWidth: 120, noRefs: true, quotingType: '"' }),
  )

  return { success: true, pack_path: packDir }
}
