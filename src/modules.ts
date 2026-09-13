// src/modules.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { z } from 'zod'
import { logger } from './logger.js'
import { toJsonSchema } from './schema.js'
import type { StorageConfig } from './storage.js'
import { readSpaceCatalog, personalSpace } from './space-catalog.js'
import { pathToFileURL } from 'node:url'
import { moduleDataPath, validModuleName } from './module-data.js'

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
  spacePath?: string
}

export interface RegisteredModuleTool {
  fullName: string          // datacore_[space_]module_tool
  moduleName: string
  definition: ModuleToolDefinition
  context: ModuleToolContext
}

/**
 * Tracks modules whose tools/index.js failed to load at server startup.
 * Keyed by installed module context; values contain categories, never exceptions.
 * Consumed by handleModulesHealth to surface startup failures.
 */
export const moduleLoadErrors: Map<string, string> = new Map()
export const moduleRegisteredTools: Map<string, Set<string>> = new Map()
export function moduleLoadKey(mod: Pick<DiscoveredModule, 'scope' | 'spaceName' | 'modulePath'>): string {
  return JSON.stringify([mod.scope, mod.spaceName ?? '', path.resolve(mod.modulePath)])
}

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

  // The installed core catalog is authoritative for every consumer.
  // A root space shares the global code directory and is scanned only once.
  for (const space of readSpaceCatalog(storage.basePath)) {
    if (space.rootPath === fs.realpathSync(storage.basePath)) continue
    modules.push(...scanModulesDir(path.join(space.rootPath, '.datacore/modules'),
      'space', space.name, space.rootPath))
  }

  return modules
}

function scanModulesDir(
  modulesDir: string,
  scope: 'global' | 'space',
  spaceName?: string,
  spacePath?: string,
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
          spacePath,
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
 * and ship tools/index.js (authored JavaScript or compiled TypeScript).
 *
 * Returns registered tools ready for MCP server integration.
 * Load failures are logged as warnings and recorded in moduleLoadErrors.
 */
export async function loadModuleTools(
  modules: DiscoveredModule[],
  storage: StorageConfig,
  reservedNames: readonly string[] = [],
): Promise<RegisteredModuleTool[]> {
  const tools: RegisteredModuleTool[] = []
  moduleLoadErrors.clear()
  moduleRegisteredTools.clear()
  const registrationKeys = new Map<RegisteredModuleTool, string>()
  let invalidNames = 0
  const spaces = storage.mode === 'full' ? readSpaceCatalog(storage.basePath) : []
  const primary = personalSpace(spaces)

  for (const mod of modules) {
    const key = moduleLoadKey(mod)
    moduleRegisteredTools.set(key, new Set())
    // Manifest names are path components as well as identifiers. Validate
    // before constructing data paths or importing a module's handlers.
    if (!validModuleName(mod.name)
      || (mod.scope === 'space' && (typeof mod.spaceName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(mod.spaceName)))) {
      invalidNames++
      moduleLoadErrors.set(key, 'invalid-identifier')
      continue
    }
    const declaredTools = mod.manifest.provides?.tools
    if (!Array.isArray(declaredTools) || declaredTools.length === 0) continue

    const destination = mod.scope === 'space'
      ? spaces.find(s => s.name === mod.spaceName && s.rootPath === mod.spacePath)
      : primary
    if (!destination) {
      moduleLoadErrors.set(key, 'data-scope-unverified')
      continue
    }
    let dataPath: string
    try { dataPath = moduleDataPath(destination.rootPath, mod.name, mod.modulePath, destination.name) }
    catch {
      moduleLoadErrors.set(key, 'module-data-unverified')
      continue
    }

    // JavaScript is the runtime artifact; no compiler runs during discovery.
    const toolsIndexPath = path.join(mod.modulePath, 'tools', 'index.js')
    if (!fs.existsSync(toolsIndexPath)) continue

    try {
      const toolsModule = await import(pathToFileURL(toolsIndexPath).href)
      const moduleTools: ModuleToolDefinition[] = toolsModule.tools || toolsModule.default?.tools || []

      const context: ModuleToolContext = {
        storage,
        modulePath: mod.modulePath,
        dataPath,
        spaceName: mod.spaceName,
      }

      for (const toolDef of moduleTools) {
        // Only register tools declared in module.yaml
        const declared = declaredTools.find(d => d?.name === toolDef?.name)
        if (!declared) continue
        try {
          toJsonSchema(toolDef.inputSchema)
          if (typeof toolDef.handler !== 'function') throw new Error('invalid handler')
        } catch {
          moduleLoadErrors.set(key, 'invalid-tool-definition')
          continue
        }

        // Scope is part of callable identity, not just hidden handler state.
        // A personal/team module must never shadow another data destination
        // through the server's name-only dispatch. Global names stay stable.
        const namespace = mod.name.replace('/', '-')
        const prefix = mod.scope === 'space'
          ? `datacore_${mod.spaceName}_${namespace}`
          : `datacore_${namespace}`
        const fullName = `${prefix}_${toolDef.name}`
        if (typeof toolDef.name !== 'string' || !/^[a-z0-9_]+$/.test(toolDef.name)
          || !/^[a-zA-Z0-9_-]{1,64}$/.test(fullName)) {
          invalidNames++
          continue
        }
        const registered = {
          fullName,
          moduleName: mod.name,
          definition: toolDef,
          context,
        }
        tools.push(registered)
        registrationKeys.set(registered, key)
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code
      const category = code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
        ? 'dependency-unavailable' : 'import-failed'
      logger.warning(`Module '${mod.name}' tools failed to load (${category}).`)
      moduleLoadErrors.set(key, category)
    }
  }

  if (invalidNames) {
    console.error(`Datacore refused ${invalidNames} invalid module/tool identifier(s).`)
  }

  const counts = new Map<string, number>()
  for (const name of reservedNames) counts.set(name, 1)
  for (const tool of tools) counts.set(tool.fullName, (counts.get(tool.fullName) ?? 0) + 1)
  // Malformed or duplicate manifests can still construct a collision. Refuse
  // every colliding candidate, preserving unrelated tools and core discovery.
  // Choosing the first/last would make installation order a routing decision.
  const ambiguous = new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name))
  if (ambiguous.size) {
    console.error(`Datacore refused ${ambiguous.size} ambiguous module tool name(s); reconcile duplicate manifests.`)
  }
  const registered = tools.filter(tool => !ambiguous.has(tool.fullName))
  for (const tool of registered) moduleRegisteredTools.get(registrationKeys.get(tool)!)!.add(tool.definition.name)
  return registered
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
