import * as path from 'path'
import { randomUUID } from 'node:crypto'
import { createText } from '../durable-files.js'
import { SessionLog, ToolCallLog, FeedbackLog, SCHEMA_VERSION } from './types.js'

export class SessionLogger {
  private log: SessionLog | null = null
  private logDir: string
  private datacoreVersion: string
  private model: string

  constructor(logDir: string, datacoreVersion: string, model: string = 'unknown') {
    this.logDir = logDir
    this.datacoreVersion = datacoreVersion
    this.model = model
  }

  startSession(sessionId: string): void {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) throw new Error('Invalid benchmark session identifier')
    this.log = {
      schema_version: SCHEMA_VERSION,
      session_id: sessionId,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_ms: 0,
      model: this.model,
      datacore_version: this.datacoreVersion,
      tool_calls: [],
      engrams_injected: [],
      engrams_created: [],
      feedback: []
    }
  }

  logToolCall(
    tool: string,
    args: unknown,
    result: unknown,
    durationMs: number,
    success: boolean,
    error?: string
  ): void {
    if (!this.log) return
    const entry: ToolCallLog = {
      tool,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      input_size: Math.ceil(JSON.stringify(args ?? {}).length / 4),  // estimated tokens (chars/4)
      output_size: Math.ceil(JSON.stringify(result ?? {}).length / 4),  // estimated tokens (chars/4)
      success
    }
    if (error) entry.error = 'tool-failed'
    this.log.tool_calls.push(entry)
  }

  trackEngramsInjected(ids: string[]): void {
    if (!this.log) return
    this.log.engrams_injected.push(...ids)
  }

  trackEngramCreated(id: string): void {
    if (!this.log) return
    this.log.engrams_created.push(id)
  }

  trackFeedback(engramId: string, rating: 'positive' | 'negative' | 'neutral'): void {
    if (!this.log) return
    this.log.feedback.push({ engram_id: engramId, rating, timestamp: new Date().toISOString() })
  }

  getLog(): SessionLog {
    if (!this.log) throw new Error('No session started')
    return { ...this.log }
  }

  endSession(): void {
    if (!this.log) return
    this.log.ended_at = new Date().toISOString()
    this.log.duration_ms = new Date(this.log.ended_at).getTime() - new Date(this.log.started_at).getTime()
    const filename = `${this.log.session_id}_${this.log.started_at.replace(/[:.]/g, '-')}_${randomUUID()}.json`
    if (!createText(this.logDir, path.join(this.logDir, filename), JSON.stringify(this.log, null, 2))) {
      throw new Error('Benchmark publication could not be confirmed')
    }
    this.log = null
  }
}
