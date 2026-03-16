import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SessionLogger } from '../../src/bench/session-logger.js'
import { SCHEMA_VERSION } from '../../src/bench/types.js'

describe('SessionLogger', () => {
  let tmpDir: string
  let logger: SessionLogger

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'))
    logger = new SessionLogger(tmpDir, '1.5.2')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('startSession creates a log with schema version', () => {
    logger.startSession('sess-1')
    const log = logger.getLog()
    expect(log.schema_version).toBe(SCHEMA_VERSION)
    expect(log.session_id).toBe('sess-1')
    expect(log.started_at).toBeTruthy()
    expect(log.ended_at).toBeNull()
  })

  it('logToolCall records tool invocation', () => {
    logger.startSession('sess-1')
    logger.logToolCall('datacore.learn', { statement: 'test' }, { id: 'eng-1' }, 150, true)
    const log = logger.getLog()
    expect(log.tool_calls).toHaveLength(1)
    expect(log.tool_calls[0].tool).toBe('datacore.learn')
    expect(log.tool_calls[0].duration_ms).toBe(150)
    expect(log.tool_calls[0].success).toBe(true)
  })

  it('logToolCall records failures', () => {
    logger.startSession('sess-1')
    logger.logToolCall('datacore.learn', {}, null, 50, false, 'validation error')
    const log = logger.getLog()
    expect(log.tool_calls[0].success).toBe(false)
    expect(log.tool_calls[0].error).toBe('validation error')
  })

  it('trackEngrams records injected and created IDs', () => {
    logger.startSession('sess-1')
    logger.trackEngramsInjected(['eng-1', 'eng-2'])
    logger.trackEngramCreated('eng-3')
    const log = logger.getLog()
    expect(log.engrams_injected).toEqual(['eng-1', 'eng-2'])
    expect(log.engrams_created).toEqual(['eng-3'])
  })

  it('trackFeedback records engram ratings', () => {
    logger.startSession('sess-1')
    logger.trackFeedback('eng-1', 'positive')
    const log = logger.getLog()
    expect(log.feedback).toHaveLength(1)
    expect(log.feedback[0].engram_id).toBe('eng-1')
    expect(log.feedback[0].rating).toBe('positive')
  })

  it('endSession writes JSON to disk', () => {
    logger.startSession('sess-1')
    logger.logToolCall('datacore.status', {}, { ok: true }, 10, true)
    logger.endSession()

    const files = fs.readdirSync(tmpDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^sess-1_.*\.json$/)

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'))
    expect(written.schema_version).toBe(SCHEMA_VERSION)
    expect(written.ended_at).toBeTruthy()
    expect(written.tool_calls).toHaveLength(1)
  })

  it('does nothing when no session started', () => {
    logger.logToolCall('datacore.status', {}, {}, 10, true)
    logger.endSession()
    const files = fs.readdirSync(tmpDir)
    expect(files).toHaveLength(0)
  })
})
