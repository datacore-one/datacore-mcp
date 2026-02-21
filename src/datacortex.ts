// src/datacortex.ts
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger.js'

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
  private pythonPath: string
  private scriptPath: string | null

  constructor(datacorePath: string) {
    this.pythonPath = process.env.DATACORE_PYTHON ?? 'python3'
    this.scriptPath = this.findBridgeScript(datacorePath)
  }

  private findBridgeScript(datacorePath: string): string | null {
    const candidates = [
      path.join(datacorePath, '.datacore', 'modules', 'datacortex', 'lib', 'bridge.py'),
      path.join(datacorePath, '.datacore', 'modules', 'datacortex', 'bridge.py'),
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
    try {
      const { execSync } = require('child_process')
      execSync(`${this.pythonPath} --version`, { timeout: 5000, stdio: 'pipe' })
      return { available: true }
    } catch {
      return { available: false, reason: `Python not found at ${this.pythonPath}` }
    }
  }

  async search(query: string, limit: number = 20): Promise<{ results: SemanticResult[]; fallback?: boolean }> {
    if (!this.scriptPath) {
      return { results: [], fallback: true }
    }

    const request = JSON.stringify({ action: 'search', query, limit })

    return new Promise((resolve) => {
      const proc = execFile(
        this.pythonPath,
        [this.scriptPath!],
        { timeout: 30000 },
        (error, stdout, stderr) => {
          if (error) {
            logger.warning(`Datacortex bridge error: ${error.message}`)
            resolve({ results: [], fallback: true })
            return
          }
          try {
            const response: BridgeResponse = JSON.parse(stdout.trim())
            if (response.error) {
              logger.warning(`Datacortex bridge: ${response.error}`)
              resolve({ results: [], fallback: true })
              return
            }
            resolve({ results: response.results ?? [] })
          } catch {
            logger.warning(`Datacortex bridge: invalid response`)
            resolve({ results: [], fallback: true })
          }
        },
      )
      proc.stdin?.write(request + '\n')
      proc.stdin?.end()
    })
  }
}
