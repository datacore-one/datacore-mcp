// src/config.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { z } from 'zod'

export const ConfigSchema = z.object({
  version: z.number().default(2),
  engrams: z.object({
    auto_promote: z.boolean().default(true),
  }).default({}),
  packs: z.object({
    trusted_publishers: z.array(z.string()).default([]),
  }).default({}),
  search: z.object({
    max_results: z.number().default(20),
    snippet_length: z.number().default(500),
  }).default({}),
  hints: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
  engagement: z.object({
    enabled: z.boolean().default(true),
    inline_xp: z.boolean().default(false),
  }).default({}),
  injection: z.object({
    directive_cap: z.number().default(10),
    consider_cap: z.number().default(5),
    spread_cap: z.number().default(3),
    spread_budget: z.number().default(480),
  }).default({}),
})

export type DatacoreConfig = z.infer<typeof ConfigSchema>

let cachedConfig: DatacoreConfig | null = null

export function loadConfig(basePath: string, mode: 'full' | 'core'): DatacoreConfig {
  const configPath = mode === 'full'
    ? path.join(basePath, '.datacore', 'config.yaml')
    : path.join(basePath, 'config.yaml')

  let raw: unknown = {}
  if (fs.existsSync(configPath)) {
    try {
      raw = yaml.load(fs.readFileSync(configPath, 'utf8')) ?? {}
    } catch {
      // Invalid YAML — use defaults
      raw = {}
    }
  }

  cachedConfig = ConfigSchema.parse(raw)
  return cachedConfig
}

export function getConfig(): DatacoreConfig {
  if (!cachedConfig) return ConfigSchema.parse({})
  return cachedConfig
}

export function resetConfigCache(): void {
  cachedConfig = null
}
