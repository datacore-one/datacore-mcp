// src/datacortex.ts
import { runForegroundPython } from './foreground-python.js'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger.js'
import { findPython } from './runtime-python.js'

interface SemanticResult {
  path: string
  score: number
  snippet: string
}

interface BridgeResponse {
  results?: SemanticResult[]
  error?: string
}

export class DatacortexBridge {
  private pythonPath: string | null
  private scriptPath: string | null

  constructor(datacorePath: string) {
    this.pythonPath = findPython()
    this.scriptPath = this.findBridgeScript(datacorePath)
  }

  private findBridgeScript(datacorePath: string): string | null {
    const explicit = process.env.DATACORE_LIB
    if (explicit !== undefined && (!explicit || !path.isAbsolute(explicit))) return null
    const moduleRoot = explicit === undefined ? path.join(datacorePath, '.datacore') : path.dirname(explicit)
    const candidates = [
      path.join(moduleRoot, 'modules', 'datacortex', 'lib', 'bridge.py'),
      path.join(moduleRoot, 'modules', 'datacortex', 'bridge.py'),
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    return null
  }

  isAvailable(): { available: boolean; reason?: string } {
    if (!this.scriptPath) {
      return { available: false, reason: 'Datacortex bridge script not found' }
    }
    return this.pythonPath ? { available: true } : { available: false, reason: 'Selected Python is unavailable or incompatible' }
  }

  async search(query: string, limit: number = 20): Promise<{ results: SemanticResult[]; fallback?: boolean }> {
    if (!this.scriptPath || !this.pythonPath) {
      return { results: [], fallback: true }
    }

    if (typeof query !== 'string' || query.length > 20000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new TypeError('Invalid semantic search request')
    }
    const request = JSON.stringify({ action: 'search', query, limit })

    const stdout = await runForegroundPython(this.pythonPath, ['-E', '-s', this.scriptPath], request + '\n')
    if (stdout === null) {
      logger.warning('Datacortex bridge process failed')
      return { results: [], fallback: true }
    }
    try {
      const response: BridgeResponse = JSON.parse(stdout.trim())
      if (!response || typeof response !== 'object' || Array.isArray(response) || response.error) {
        logger.warning('Datacortex bridge refused the request')
        return { results: [], fallback: true }
      }
      if (!Array.isArray(response.results) || response.results.some(row =>
        !row || typeof row.path !== 'string' || typeof row.snippet !== 'string'
        || typeof row.score !== 'number' || !Number.isFinite(row.score))) {
        throw new TypeError('Invalid bridge results')
      }
      return { results: response.results.slice(0, limit) }
    } catch {
      logger.warning('Datacortex bridge returned an invalid response')
      return { results: [], fallback: true }
    }
  }
}
