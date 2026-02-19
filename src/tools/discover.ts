// src/tools/discover.ts
import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const registry = require('../../registry/packs.json')

interface RegistryPack {
  id: string; name: string; description: string; version: string
  author: string; tags: string[]; download_url: string
  engram_count: number; free: boolean
}

interface DiscoverPack extends RegistryPack {
  installed: boolean
  installed_version?: string
  upgradeable: boolean
}

interface DiscoverResult {
  packs: DiscoverPack[]
}

export function handleDiscover(
  args: { query?: string; tags?: string[] },
  packsDir: string,
): DiscoverResult {
  let packs: DiscoverPack[] = registry.packs.map((p: RegistryPack) => {
    const localDir = path.join(packsDir, p.id)
    const installed = fs.existsSync(path.join(localDir, 'SKILL.md'))
    let installedVersion: string | undefined
    if (installed) {
      try {
        const content = fs.readFileSync(path.join(localDir, 'SKILL.md'), 'utf8')
        const match = content.match(/version:\s*["']?([^"'\n]+)/)
        installedVersion = match?.[1]
      } catch {}
    }
    return {
      ...p,
      installed,
      installed_version: installedVersion,
      upgradeable: installed && installedVersion !== p.version,
    }
  })

  if (args.query) {
    const q = args.query.toLowerCase()
    packs = packs.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  if (args.tags?.length) {
    const filterTags = new Set(args.tags.map(t => t.toLowerCase()))
    packs = packs.filter(p => p.tags.some(t => filterTags.has(t.toLowerCase())))
  }

  return { packs }
}
