import * as fs from 'fs'
import * as path from 'path'
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
    if (error) entry.error = error
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
    fs.mkdirSync(this.logDir, { recursive: true })
    const filename = `${this.log.session_id}_${this.log.started_at.replace(/[:.]/g, '-')}.json`
    fs.writeFileSync(path.join(this.logDir, filename), JSON.stringify(this.log, null, 2))
    this.log = null
  }
}
