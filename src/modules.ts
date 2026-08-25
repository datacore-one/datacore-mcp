// src/modules.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { z } from 'zod'
import { logger } from './logger.js'
import type { StorageConfig } from './storage.js'

export interface ModuleToolDefinition {
  name: string              // Without namespace prefix (e.g., 'inbox_count')
  description: string
  // Zod OR a plain JSON Schema object. Modules are third-party by design
  // (DIP-0001), and requiring them to import the server's exact Zod version is
  // a coupling that broke tool discovery outright — see src/schema.ts.
  // Record<string, unknown> rather than bare `object`: it keeps property
  // access type-checkable for callers that inspect the schema.
  inputSchema: z.ZodType | Record<string, unknown>
  handler: (args: unknown, context: ModuleToolContext) => Promise<unknown>
}

export interface ModuleToolContext {
  storage: StorageConfig
  modulePath: string        // Path to module code directory
  dataPath: string          // Path to module's private data directory
  spaceName?: string        // Active space (if space-scoped)
}

export interface ModuleManifest {
  manifest_version?: number
  name: string
  version?: string
  description?: string
  builtin?: boolean
  provides?: {
    tools?: Array<{
      name: string
      description: string
      handler: string       // Relative path to handler file
    }>
    skills?: unknown[]
    agents?: unknown[]
    commands?: unknown[]
    workflows?: unknown[]
  }
  context?: {
    priority?: 'always' | 'minimal' | 'on_demand'
    summary?: string
  }
  engrams?: {
    namespace?: string
    starter_pack?: string
    injection_policy?: string
    match_terms?: string[]
  }
  requires?: {
    env_vars?: {
      required?: string[]
      optional?: string[]
    }
  }
  settings?: Record<string, unknown>
}

export interface DiscoveredModule {
  name: string
  manifest: ModuleManifest
  modulePath: string        // Absolute path to module code (symlink path if symlinked)
  realPath: string          // Physical path after resolving symlinks (equals modulePath when not a symlink)
  isSymlink: boolean        // True when the entry in .datacore/modules/ is a symlink
  scope: 'global' | 'space'
  spaceName?: string
}

export interface RegisteredModuleTool {
  fullName: string          // datacore_[module]_[tool]
  moduleName: string
  definition: ModuleToolDefinition
  context: ModuleToolContext
}

/**
 * Tracks modules whose tools/index.js failed to load at server startup.
 * Keyed by module name; value is the error message.
 * Consumed by handleModulesHealth to surface startup failures.
 */
export const moduleLoadErrors: Map<string, string> = new Map()

/**
 * Discover all installed modules by scanning module directories.
 * Checks global (.datacore/modules/) and space-scoped ([space]/.datacore/modules/).
 */
export function discoverModules(storage: StorageConfig): DiscoveredModule[] {
  const modules: DiscoveredModule[] = []

  if (storage.mode !== 'full') return modules

  // 1. Global modules: basePath/.datacore/modules/*/
  const globalModulesDir = path.join(storage.basePath, '.datacore', 'modules')
  modules.push(...scanModulesDir(globalModulesDir, 'global'))

  // 2. Space modules: basePath/[0-9]-*//.datacore/modules/*/
  try {
    const entries = fs.readdirSync(storage.basePath)
    for (const entry of entries) {
      if (/^\d+-/.test(entry)) {
        const spaceModulesDir = path.join(storage.basePath, entry, '.datacore', 'modules')
        modules.push(...scanModulesDir(spaceModulesDir, 'space', entry))
      }
    }
  } catch {
    // basePath not readable — skip space scan
  }

  return modules
}

function scanModulesDir(
  modulesDir: string,
  scope: 'global' | 'space',
  spaceName?: string,
): DiscoveredModule[] {
  const modules: DiscoveredModule[] = []

  if (!fs.existsSync(modulesDir)) return modules

  try {
    const entries = fs.readdirSync(modulesDir)
    for (const entry of entries) {
      const modulePath = path.join(modulesDir, entry)

      // Use lstatSync (not stat) so we detect symlinks rather than following them
      let entryStat: fs.Stats
      try {
        entryStat = fs.lstatSync(modulePath)
      } catch {
        continue
      }
      const isSymlink = entryStat.isSymbolicLink()
      let realPath: string
      try {
        realPath = isSymlink ? fs.realpathSync(modulePath) : modulePath
      } catch {
        // Dangling symlink — realpath fails; keep modulePath so health check can report it
        realPath = modulePath
      }

      const manifestPath = path.join(realPath, 'module.yaml')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8')
        const manifest = yaml.load(raw) as ModuleManifest
        if (!manifest || !manifest.name) continue

        modules.push({
          name: manifest.name,
          manifest,
          modulePath,
          realPath,
          isSymlink,
          scope,
          spaceName,
        })
      } catch {
        // Invalid YAML or missing name — skip
      }
    }
  } catch {
    // Directory not readable — skip
  }

  return modules
}

/**
 * Load module tools from discovered modules.
 * Only loads tools from modules that declare provides.tools in module.yaml
 * and have a valid tools/index.ts (compiled to .js) handler.
 *
 * Returns registered tools ready for MCP server integration.
 * Load failures are logged as warnings and recorded in moduleLoadErrors.
 */
export async function loadModuleTools(
  modules: DiscoveredModule[],
  storage: StorageConfig,
): Promise<RegisteredModuleTool[]> {
  const tools: RegisteredModuleTool[] = []

  for (const mod of modules) {
    const declaredTools = mod.manifest.provides?.tools
    if (!declaredTools || declaredTools.length === 0) continue

    // Try to load the tools/index.ts (compiled to .js)
    const toolsIndexPath = path.join(mod.modulePath, 'tools', 'index.js')
    if (!fs.existsSync(toolsIndexPath)) continue

    try {
      const toolsModule = await import(toolsIndexPath)
      const moduleTools: ModuleToolDefinition[] = toolsModule.tools || toolsModule.default?.tools || []

      // Build data path for this module's private data
      const dataPath = mod.scope === 'space' && mod.spaceName
        ? path.join(storage.basePath, mod.spaceName, '.datacore', 'modules', mod.name, 'data')
        : path.join(storage.basePath, '0-personal', '.datacore', 'modules', mod.name, 'data')

      const context: ModuleToolContext = {
        storage,
        modulePath: mod.modulePath,
        dataPath,
        spaceName: mod.spaceName,
      }

      for (const toolDef of moduleTools) {
        // Only register tools declared in module.yaml
        const declared = declaredTools.find(d => d.name === toolDef.name)
        if (!declared) continue

        tools.push({
          fullName: `datacore_${mod.name}_${toolDef.name}`,
          moduleName: mod.name,
          definition: toolDef,
          context,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`Module '${mod.name}' tools failed to load at startup: ${message}`)
      moduleLoadErrors.set(mod.name, message)
    }
  }

  return tools
}

/**
 * Get module info for the modules.list and modules.info tools.
 */
export function getModuleInfo(mod: DiscoveredModule): Record<string, unknown> {
  const m = mod.manifest
  return {
    name: m.name,
    version: m.version || '0.0.0',
    description: m.description || '',
    scope: mod.scope,
    space: mod.spaceName,
    builtin: m.builtin || false,
    manifest_version: m.manifest_version || 1,
    provides: {
      tools: m.provides?.tools?.length || 0,
      skills: m.provides?.skills?.length || 0,
      agents: m.provides?.agents?.length || 0,
      commands: m.provides?.commands?.length || 0,
      workflows: m.provides?.workflows?.length || 0,
    },
    context_priority: m.context?.priority || 'minimal',
    engrams: m.engrams ? {
      namespace: m.engrams.namespace,
      injection_policy: m.engrams.injection_policy,
      has_starter_pack: !!m.engrams.starter_pack,
    } : null,
    requires: m.requires?.env_vars ? {
      env_required: m.requires.env_vars.required || [],
      env_optional: m.requires.env_vars.optional || [],
    } : null,
    path: mod.modulePath,
  }
}
