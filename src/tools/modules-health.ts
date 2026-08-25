// src/tools/modules-health.ts
import * as fs from 'fs'
import * as path from 'path'
import { discoverModules, moduleLoadErrors, type DiscoveredModule } from '../modules.js'
import type { StorageConfig } from '../storage.js'

export interface HealthIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  hint?: string
}

interface HealthCheck {
  name: string
  status: 'ok' | 'warning' | 'error'
  symlink?: { target: string } | null
  issues: HealthIssue[]
}

export async function handleModulesHealth(
  args: { module?: string },
  storage: StorageConfig,
  cachedModules?: DiscoveredModule[],
): Promise<unknown> {
  const modules = cachedModules ?? discoverModules(storage)

  if (args.module) {
    const found = modules.find(m => m.manifest.name === args.module)
    if (!found) {
      return { error: `Module '${args.module}' not found` }
    }
    return await checkModule(found, storage)
  }

  // Check all modules
  const checks = await Promise.all(modules.map(m => checkModule(m, storage)))
  const ok = checks.filter(c => c.status === 'ok').length
  const warnings = checks.filter(c => c.status === 'warning').length
  const errors = checks.filter(c => c.status === 'error').length

  return {
    summary: { total: checks.length, ok, warnings, errors },
    modules: checks,
  }
}

async function checkModule(
  mod: DiscoveredModule,
  storage: StorageConfig,
): Promise<HealthCheck> {
  const issues: HealthIssue[] = []
  const manifest = mod.manifest as unknown as Record<string, unknown>

  // Surface any tool load failure recorded at server startup
  const startupLoadError = moduleLoadErrors.get(mod.name)
  if (startupLoadError) {
    issues.push({
      severity: 'error',
      code: 'TOOLS_LOAD_FAILED',
      message: `Tool load failed at startup: ${startupLoadError}`,
      hint: startupLoadError.includes('Cannot find package')
        ? 'Module tool imports a package not available at runtime. See DIP-0028 §3 (bundle the tool) or §4 (use @datacore-one/mcp/runtime).'
        : 'See DIP-0028 for module tool loading architecture and bundling requirements.',
    })
  }

  // Check required files
  if (!fs.existsSync(path.join(mod.realPath, 'SKILL.md'))) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_SKILL_MD',
      message: 'Missing SKILL.md (ecosystem entry point)',
    })
  }
  if (!fs.existsSync(path.join(mod.realPath, 'CLAUDE.base.md'))) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_CLAUDE_BASE_MD',
      message: 'Missing CLAUDE.base.md (AI context)',
    })
  }

  // Check manifest version
  if (!manifest.manifest_version || (manifest.manifest_version as number) < 2) {
    issues.push({
      severity: 'warning',
      code: 'MANIFEST_VERSION_OUTDATED',
      message: 'module.yaml uses v1 format (missing manifest_version: 2)',
    })
  }

  // Check env vars
  const requires = manifest.requires as { env_vars?: { required?: string[] } } | undefined
  const requiredEnv = requires?.env_vars?.required || []
  for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
      issues.push({
        severity: 'error',
        code: 'MISSING_ENV_VAR',
        message: `Missing required env var: ${envVar}`,
      })
    }
  }

  // Check declared tools have handlers.
  // Modules export tools as `export const tools = [{ name, handler }, ...]`
  // (see crm/tools/index.js, gtd/tools/index.js, etc). We accept either
  // that array shape or a top-level named export — older modules may
  // still use the per-name pattern.
  const provides = manifest.provides as { tools?: Array<{ name: string; handler?: string }> } | undefined
  const declaredTools = provides?.tools || []
  if (declaredTools.length > 0) {
    // Use realPath for the actual file import to avoid double-resolution with symlinks (DIP-0028 §5)
    const toolsIndex = path.join(mod.realPath, 'tools', 'index.js')
    if (!fs.existsSync(toolsIndex)) {
      issues.push({
        severity: 'error',
        code: 'TOOLS_INDEX_MISSING',
        message: `Declares ${declaredTools.length} tools but tools/index.js not found`,
      })
    } else {
      try {
        const toolModule = await import(toolsIndex)
        const arrayTools: Array<{ name: string; handler?: unknown }> =
          (toolModule.tools as Array<{ name: string; handler?: unknown }>) ??
          (toolModule.default?.tools as Array<{ name: string; handler?: unknown }>) ??
          []
        const exportedNames = new Set(
          arrayTools.filter(t => typeof t?.handler === 'function').map(t => t.name),
        )
        for (const tool of declaredTools) {
          const handlerName = tool.handler || tool.name
          const inArray = exportedNames.has(tool.name)
          const asNamedExport = typeof toolModule[handlerName] === 'function'
          if (!inArray && !asNamedExport) {
            issues.push({
              severity: 'warning',
              code: 'TOOL_HANDLER_MISSING',
              message: `Tool '${tool.name}' declared in module.yaml but no matching handler exported`,
            })
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        issues.push({
          severity: 'error',
          code: 'TOOLS_LOAD_FAILED',
          message: `tools/index.js failed to import: ${detail}`,
          hint: detail.includes('Cannot find package')
            ? 'Module tool imports a package not available at runtime. See DIP-0028 §3 (bundle the tool) or §4 (use @datacore-one/mcp/runtime).'
            : 'See DIP-0028 for module tool loading architecture and bundling requirements.',
        })
      }
    }
  }

  // Check data separation (no data files in module code dir).
  // package.json / package-lock.json / tsconfig*.json are config files
  // that legitimately live in the module dir for ESM dep resolution and
  // TypeScript builds — whitelist them.
  const suspectExts = ['.db', '.sqlite', '.json']
  const configWhitelist = new Set([
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'tsconfig.build.json',
  ])
  const suspectDirs = ['output', 'data', 'state']
  for (const dir of suspectDirs) {
    const fullPath = path.join(mod.realPath, dir)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      issues.push({
        severity: 'warning',
        code: 'DATA_IN_MODULE_DIR',
        message: `Data dir '${dir}/' found in module code (should be in space data path)`,
      })
    }
  }
  try {
    const entries = fs.readdirSync(mod.realPath)
    for (const entry of entries) {
      if (configWhitelist.has(entry)) continue
      if (suspectExts.some(ext => entry.endsWith(ext))) {
        issues.push({
          severity: 'warning',
          code: 'DATA_FILE_IN_MODULE_DIR',
          message: `Data file '${entry}' found in module code dir`,
        })
      }
    }
  } catch { /* ignore */ }

  // Symlink-specific checks (DIP-0028 §5)
  if (mod.isSymlink) {
    if (!fs.existsSync(mod.realPath)) {
      // Dangling symlink: target path does not exist (realpathSync may have fallen back to modulePath)
      issues.push({
        severity: 'error',
        code: 'SYMLINK_TARGET_MISSING',
        message: `Symlink target does not exist or is inaccessible: ${mod.modulePath}`,
      })
    } else if (declaredTools.length > 0 && !isLikelyBundled(path.join(mod.realPath, 'tools', 'index.js'))) {
      issues.push({
        severity: 'warning',
        code: 'SYMLINK_UNBUNDLED_TOOLS',
        message: 'Symlinked module with unbundled tools — may fail to load on other machines',
        hint: 'Symlinked modules must use bundled tools/index.js. See DIP-0028 §5.',
      })
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error')
  const hasWarnings = issues.some(i => i.severity === 'warning')

  return {
    name: mod.name as string,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok',
    symlink: mod.isSymlink ? { target: mod.realPath } : null,
    issues,
  }
}

// Heuristic: a bundled file is typically >20 KB (includes all deps inline)
function isLikelyBundled(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath)
    return stat.size > 20_000
  } catch {
    return false
  }
}
