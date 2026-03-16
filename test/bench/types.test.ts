import { describe, it, expect } from 'vitest'
import { SessionLog, ToolCallLog, SCHEMA_VERSION } from '../../src/bench/types.js'

describe('bench types', () => {
  it('SCHEMA_VERSION is 1.0', () => {
    expect(SCHEMA_VERSION).toBe('1.0')
  })

  it('SessionLog round-trips through JSON', () => {
    const log: SessionLog = {
      schema_version: SCHEMA_VERSION,
      session_id: 'test-123',
      started_at: '2026-03-16T10:00:00Z',
      ended_at: null,
      duration_ms: 0,
      model: 'claude-sonnet-4-6',
      datacore_version: '1.5.2',
      tool_calls: [{
        tool: 'datacore.status',
        timestamp: '2026-03-16T10:00:01Z',
        duration_ms: 50,
        input_size: 10,
        output_size: 200,
        success: true
      }],
      engrams_injected: ['eng-1'],
      engrams_created: [],
      feedback: []
    }
    const json = JSON.stringify(log)
    const parsed = JSON.parse(json) as SessionLog
    expect(parsed.schema_version).toBe('1.0')
    expect(parsed.model).toBe('claude-sonnet-4-6')
    expect(parsed.duration_ms).toBe(0)
    expect(parsed.tool_calls).toHaveLength(1)
    expect(parsed.tool_calls[0].tool).toBe('datacore.status')
  })
})
