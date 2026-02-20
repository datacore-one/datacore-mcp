// src/tools/modules-list.ts
import { discoverModules, getModuleInfo } from '../modules.js'
import type { StorageConfig } from '../storage.js'

export async function handleModulesList(
  _args: unknown,
  storage: StorageConfig,
): Promise<unknown> {
  const modules = discoverModules(storage)

  if (modules.length === 0) {
    return {
      count: 0,
      modules: [],
      message: storage.mode === 'standalone'
        ? 'Module discovery requires a full Datacore installation'
        : 'No modules found',
    }
  }

  return {
    count: modules.length,
    modules: modules.map(m => ({
      name: m.manifest.name,
      version: m.manifest.version || '0.0.0',
      description: m.manifest.description || '',
      scope: m.scope,
      space: m.spaceName || null,
      builtin: m.manifest.builtin || false,
      manifest_version: m.manifest.manifest_version || 1,
      provides: {
        tools: m.manifest.provides?.tools?.length || 0,
        skills: m.manifest.provides?.skills?.length || 0,
        agents: m.manifest.provides?.agents?.length || 0,
        commands: m.manifest.provides?.commands?.length || 0,
        workflows: m.manifest.provides?.workflows?.length || 0,
      },
      context_priority: m.manifest.context?.priority || 'minimal',
    })),
  }
}
