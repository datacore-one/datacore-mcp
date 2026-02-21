// src/tools/discover.ts
import * as fs from 'fs'
import * as path from 'path'
import { getConfig } from '../config.js'
import registry from '../../registry/packs.json'

interface RegistryPack {
  id: string; name: string; description: string; version: string
  author: string; tags: string[]; download_url: string
  engram_count: number; free: boolean
}

interface DiscoverPack extends RegistryPack {
  installed: boolean
  installed_version?: string
  upgradeable: boolean
  can_install: boolean
}

interface DiscoverResult {
  packs: DiscoverPack[]
  auto_installable?: string[]
  auto_upgradeable?: string[]
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
      can_install: !!p.download_url,
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

  // Check trusted publishers for auto-install/upgrade suggestions
  const trusted = new Set(getConfig().packs.trusted_publishers)
  const result: DiscoverResult = { packs }

  if (trusted.size > 0) {
    const autoInstallable = packs
      .filter(p => trusted.has(p.author) && !p.installed && p.can_install)
      .map(p => p.id)
    const autoUpgradeable = packs
      .filter(p => trusted.has(p.author) && p.upgradeable)
      .map(p => p.id)

    if (autoInstallable.length > 0) result.auto_installable = autoInstallable
    if (autoUpgradeable.length > 0) result.auto_upgradeable = autoUpgradeable
  }

  return result
}
