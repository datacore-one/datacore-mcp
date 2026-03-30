// src/tools/export.ts
import { getPlur } from '../plur-bridge.js'
import type { Engram } from '@plur-ai/core'

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
  const plur = getPlur()
  const allEngrams = plur.list()
  let selected = allEngrams.filter(e => e.visibility === 'public' || e.visibility === 'template')

  if (selected.length === 0 && !args.engram_ids?.length) {
    return { success: false, error: 'No exportable engrams found (only public/template engrams can be exported)' }
  }

  // Apply filters
  if (args.engram_ids?.length) {
    const idSet = new Set(args.engram_ids)
    // For explicit IDs, still filter for public/template from allEngrams
    selected = allEngrams.filter(e =>
      idSet.has(e.id) &&
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

  // Preview mode (default)
  if (!args.confirm) {
    const packDir = `${paths.packsPath}/${packId}`
    return {
      success: true,
      preview: {
        count: selected.length,
        statements: selected.map(e => e.statement).slice(0, 10),
        pack_path: packDir,
      },
    }
  }

  // Export via PLUR
  const result = plur.exportPack(selected, paths.packsPath, {
    name: args.name,
    version: '1.0.0',
    description: args.description,
  })

  return { success: true, pack_path: result.path }
}
