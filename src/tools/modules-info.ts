// src/tools/modules-info.ts
import { discoverModules, getModuleInfo, type DiscoveredModule } from '../modules.js'
import type { StorageConfig } from '../storage.js'

export async function handleModulesInfo(
  args: { module: string },
  storage: StorageConfig,
  cachedModules?: DiscoveredModule[],
): Promise<unknown> {
  const modules = cachedModules ?? discoverModules(storage)
  const found = modules.find(m => m.manifest.name === args.module)

  if (!found) {
    return { error: `Module '${args.module}' not found`, installed_modules: modules.map(m => m.name) }
  }

  return getModuleInfo(found)
}
