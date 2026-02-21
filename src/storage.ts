// src/storage.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export type StorageMode = 'full' | 'standalone'

export interface StorageConfig {
  mode: StorageMode
  basePath: string
  engramsPath: string
  journalPath: string
  knowledgePath: string
  packsPath: string
}

export function detectStorage(): StorageConfig {
  // 1. Explicit DATACORE_PATH (full installation)
  const dcPath = process.env.DATACORE_PATH
  if (dcPath && fs.existsSync(path.join(dcPath, '.datacore'))) {
    return fullConfig(dcPath)
  }

  // 2. Explicit standalone path (env var overrides auto-detection)
  const standalonePath = process.env.DATACORE_STANDALONE_PATH
  if (standalonePath && fs.existsSync(standalonePath)) {
    return standaloneConfig(standalonePath)
  }

  // 3. Default full installation at ~/Data
  const defaultFull = path.join(os.homedir(), 'Data')
  if (fs.existsSync(path.join(defaultFull, '.datacore'))) {
    return fullConfig(defaultFull)
  }

  // 4. Default standalone at ~/Datacore
  return standaloneConfig(path.join(os.homedir(), 'Datacore'))
}

function fullConfig(basePath: string): StorageConfig {
  return {
    mode: 'full',
    basePath,
    engramsPath: path.join(basePath, '.datacore', 'learning', 'engrams.yaml'),
    journalPath: path.join(basePath, '0-personal', 'journal'),
    knowledgePath: path.join(basePath, '0-personal', '3-knowledge'),
    packsPath: path.join(basePath, '.datacore', 'learning', 'packs'),
  }
}

function standaloneConfig(basePath: string): StorageConfig {
  return {
    mode: 'standalone',
    basePath,
    engramsPath: path.join(basePath, 'engrams.yaml'),
    journalPath: path.join(basePath, 'journal'),
    knowledgePath: path.join(basePath, 'knowledge'),
    packsPath: path.join(basePath, 'packs'),
  }
}

export function initStandalone(basePath: string): { isFirstRun: boolean } {
  const isFirstRun = !fs.existsSync(path.join(basePath, 'engrams.yaml'))
  for (const dir of ['journal', 'knowledge', 'packs']) {
    const dirPath = path.join(basePath, dir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  const engramsPath = path.join(basePath, 'engrams.yaml')
  if (!fs.existsSync(engramsPath)) {
    fs.writeFileSync(engramsPath, 'engrams: []\n')
  }

  const configPath = path.join(basePath, 'config.yaml')
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, '# Datacore MCP configuration\nversion: 1\n')
  }

  copyStarterPacks(basePath)
  return { isFirstRun }
}

function copyStarterPacks(basePath: string): void {
  const packsDir = path.join(basePath, 'packs')
  const bundledPacksDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..', 'packs'
  )

  if (!fs.existsSync(bundledPacksDir)) return

  for (const entry of fs.readdirSync(bundledPacksDir)) {
    const src = path.join(bundledPacksDir, entry)
    const dest = path.join(packsDir, entry)
    if (!fs.existsSync(dest) && fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true })
    }
  }
}
