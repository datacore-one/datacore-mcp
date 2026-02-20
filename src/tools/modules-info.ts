// src/tools/modules-info.ts
import { discoverModules, getModuleInfo } from '../modules.js'
import type { StorageConfig } from '../storage.js'

export async function handleModulesInfo(
  args: { module: string },
  storage: StorageConfig,
): Promise<unknown> {
  const modules = discoverModules(storage)
  const found = modules.find(m => m.manifest.name === args.module)

  if (!found) {
    return { error: `Module '${args.module}' not found`, installed_modules: modules.map(m => m.name) }
  }

  return getModuleInfo(found)
}
