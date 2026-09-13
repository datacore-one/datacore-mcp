// src/tools/modules-info.ts
import { discoverModules, getModuleInfo, type DiscoveredModule } from '../modules.js'
import type { StorageConfig } from '../storage.js'

export async function handleModulesInfo(
  args: { module: string },
  storage: StorageConfig,
  cachedModules?: DiscoveredModule[],
): Promise<unknown> {
  const modules = cachedModules ?? discoverModules(storage)
  const matches = modules.filter(m => m.manifest.name === args.module)
  if (matches.length > 1) return { error: 'Module name is ambiguous across scopes; inspect the complete module list.' }
  const found = matches[0]

  if (!found) {
    return { error: `Module '${args.module}' not found`, installed_modules: modules.map(m => m.name) }
  }

  return getModuleInfo(found)
}
