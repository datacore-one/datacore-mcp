// src/logger.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'

export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
}

const MAX_MESSAGE_LENGTH = 4096

class Logger {
  private server: Server | null = null
  private minLevel: LogLevel

  constructor() {
    const envLevel = process.env.DATACORE_LOG_LEVEL?.toLowerCase()
    this.minLevel = envLevel && envLevel in LEVEL_ORDER
      ? envLevel as LogLevel
      : 'warning'
  }

  setServer(server: Server): void {
    this.server = server
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel]
  }

  private truncate(msg: string): string {
    if (msg.length <= MAX_MESSAGE_LENGTH) return msg
    return msg.slice(0, MAX_MESSAGE_LENGTH - 3) + '...'
  }

  private emit(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return
    const truncated = this.truncate(message)

    // Always write to stderr for debug traces
    process.stderr.write(`[datacore:${level}] ${truncated}\n`)

    // Send MCP notification for warning+ if server connected
    if (this.server && LEVEL_ORDER[level] >= LEVEL_ORDER['warning']) {
      try {
        this.server.sendLoggingMessage({ level, data: truncated })
      } catch {
        // Server not connected or notification failed — ignore
      }
    }
  }

  debug(message: string): void { this.emit('debug', message) }
  info(message: string): void { this.emit('info', message) }
  warning(message: string): void { this.emit('warning', message) }
  error(message: string): void { this.emit('error', message) }
}

export const logger = new Logger()
