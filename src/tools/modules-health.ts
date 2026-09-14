// src/tools/modules-health.ts
import * as fs from 'fs'
import * as path from 'path'
import { discoverModules, moduleLoadErrors, moduleLoadKey, moduleRegisteredTools, moduleSelection, type DiscoveredModule } from '../modules.js'
import type { StorageConfig } from '../storage.js'

export interface HealthIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  hint?: string
}

interface HealthCheck {
  name: string
  scope: 'global' | 'space'
  space: string | null
  status: 'ok' | 'warning' | 'error'
  symlink?: { target: string } | null
  issues: HealthIssue[]
  selection?: string
}

export async function handleModulesHealth(
  args: { module?: string },
  storage: StorageConfig,
  cachedModules?: DiscoveredModule[],
): Promise<unknown> {
  const modules = cachedModules ?? discoverModules(storage)

  if (args.module) {
    const matches = modules.filter(m => m.manifest.name === args.module)
    if (matches.length > 1) return { error: 'Module name is ambiguous across scopes; inspect the complete scoped health report.' }
    const found = matches[0]
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
  const selection = moduleSelection.get(moduleLoadKey(mod))
  if (selection === 'not-selected' || selection === 'overridden') {
    return { name: mod.name, scope: mod.scope, space: mod.spaceName ?? null,
      status: 'warning', selection, issues: [{ severity: 'warning', code: 'MODULE_NOT_SELECTED',
        message: 'This module is outside the selected module context or overridden by a more specific installation.' }] }
  }

  // Surface any tool load failure recorded at server startup
  const startupLoadError = moduleLoadErrors.get(moduleLoadKey(mod))
  if (startupLoadError) {
    issues.push({
      severity: 'error',
      code: 'TOOLS_LOAD_FAILED',
      message: `Tool registration failed at startup (${startupLoadError}).`,
      hint: 'Reconcile the installed module artifact and its declared dependencies, then restart and verify registration.',
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

  // Inspect actual startup registration. A health request must not import code
  // through a second path or equate a named export with a registered tool.
  const provides = manifest.provides as { tools?: Array<{ name: string; handler?: string }> } | undefined
  const declaredTools = provides?.tools || []
  if (declaredTools.length > 0) {
    const toolsIndex = path.join(mod.realPath, 'tools', 'index.js')
    if (!fs.existsSync(toolsIndex)) {
      issues.push({
        severity: 'error',
        code: 'TOOLS_INDEX_MISSING',
        message: `Declares ${declaredTools.length} tools but tools/index.js not found`,
      })
    } else {
      const registered = moduleRegisteredTools.get(moduleLoadKey(mod))
      if (registered) {
        for (const tool of declaredTools) {
          if (!registered.has(tool.name)) {
            issues.push({
              severity: 'warning',
              code: 'TOOL_HANDLER_MISSING',
              message: `Tool '${tool.name}' declared in module.yaml but not registered at startup`,
            })
          }
        }
      } else {
        issues.push({
          severity: 'error',
          code: 'TOOLS_NOT_VERIFIED',
          message: 'No startup registration evidence is available for this module.',
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

  // Symlink status is not proof of dependency availability or bundling.
  if (mod.isSymlink) {
    if (!fs.existsSync(mod.realPath)) {
      // Dangling symlink: target path does not exist (realpathSync may have fallen back to modulePath)
      issues.push({
        severity: 'error',
        code: 'SYMLINK_TARGET_MISSING',
        message: `Symlink target does not exist or is inaccessible: ${mod.modulePath}`,
      })
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error')
  const hasWarnings = issues.some(i => i.severity === 'warning')

  return {
    name: mod.name as string,
    scope: mod.scope,
    space: mod.spaceName ?? null,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok',
    symlink: mod.isSymlink ? { target: mod.realPath } : null,
    issues,
    selection,
  }
}
