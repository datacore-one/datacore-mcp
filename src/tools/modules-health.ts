// src/tools/modules-health.ts
import * as fs from 'fs'
import * as path from 'path'
import { discoverModules, type DiscoveredModule } from '../modules.js'
import type { StorageConfig } from '../storage.js'

interface HealthCheck {
  name: string
  status: 'ok' | 'warning' | 'error'
  issues: string[]
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
  mod: { name: string; manifest: Record<string, unknown>; modulePath: string },
  storage: StorageConfig,
): Promise<HealthCheck> {
  const issues: string[] = []
  const manifest = mod.manifest as Record<string, unknown>

  // Check required files
  if (!fs.existsSync(path.join(mod.modulePath, 'SKILL.md'))) {
    issues.push('Missing SKILL.md (ecosystem entry point)')
  }
  if (!fs.existsSync(path.join(mod.modulePath, 'CLAUDE.base.md'))) {
    issues.push('Missing CLAUDE.base.md (AI context)')
  }

  // Check manifest version
  if (!manifest.manifest_version || (manifest.manifest_version as number) < 2) {
    issues.push('module.yaml uses v1 format (missing manifest_version: 2)')
  }

  // Check env vars
  const requires = manifest.requires as { env_vars?: { required?: string[] } } | undefined
  const requiredEnv = requires?.env_vars?.required || []
  for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
      issues.push(`Missing required env var: ${envVar}`)
    }
  }

  // Check declared tools have handlers
  const provides = manifest.provides as { tools?: Array<{ name: string; handler: string }> } | undefined
  const declaredTools = provides?.tools || []
  if (declaredTools.length > 0) {
    const toolsIndex = path.join(mod.modulePath, 'tools', 'index.js')
    if (!fs.existsSync(toolsIndex)) {
      issues.push(`Declares ${declaredTools.length} tools but tools/index.js not found`)
    } else {
      // Attempt to verify exports match declarations
      try {
        const toolModule = await import(toolsIndex)
        for (const tool of declaredTools) {
          const handlerName = tool.handler || tool.name
          if (typeof toolModule[handlerName] !== 'function') {
            issues.push(`Tool '${tool.name}' declares handler '${handlerName}' but export not found`)
          }
        }
      } catch (err) {
        issues.push(`tools/index.js failed to load: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // Check data separation (no data files in module code dir)
  const suspectExts = ['.db', '.sqlite', '.json']
  const suspectDirs = ['output', 'data', 'state']
  for (const dir of suspectDirs) {
    const fullPath = path.join(mod.modulePath, dir)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      issues.push(`Data dir '${dir}/' found in module code (should be in space data path)`)
    }
  }
  try {
    const entries = fs.readdirSync(mod.modulePath)
    for (const entry of entries) {
      if (suspectExts.some(ext => entry.endsWith(ext))) {
        issues.push(`Data file '${entry}' found in module code dir`)
      }
    }
  } catch { /* ignore */ }

  return {
    name: mod.name as string,
    status: issues.length === 0 ? 'ok' : issues.some(i => i.startsWith('Missing required')) ? 'error' : 'warning',
    issues,
  }
}
