import { describe, it, expect } from 'vitest'
import { SessionBreadcrumbs } from '../src/session-state.js'

describe('SessionBreadcrumbs', () => {
  it('records tool calls', () => {
    const bc = new SessionBreadcrumbs()
    bc.recordToolCall('datacore.recall', { topic: 'trading' })
    bc.recordToolCall('datacore.learn', { statement: 'test' })
    expect(bc.getToolCalls()).toHaveLength(2)
    expect(bc.getToolCalls()[0].tool).toBe('datacore.recall')
  })

  it('records engram IDs recalled without duplicates', () => {
    const bc = new SessionBreadcrumbs()
    bc.recordEngramRecalled('ENG-2026-0301-001')
    bc.recordEngramRecalled('ENG-2026-0301-002')
    bc.recordEngramRecalled('ENG-2026-0301-001')
    expect(bc.getEngramsRecalled()).toEqual(['ENG-2026-0301-001', 'ENG-2026-0301-002'])
  })

  it('generates continuation context summary', () => {
    const bc = new SessionBreadcrumbs()
    bc.recordToolCall('datacore.recall', { topic: 'trading' })
    bc.recordToolCall('datacore.learn', { statement: 'new insight' })
    bc.recordEngramRecalled('ENG-2026-0301-001')

    const summary = bc.generateContinuationContext()
    expect(summary).toContain('Tools used: datacore.recall, datacore.learn')
    expect(summary).toContain('Engrams recalled: 1')
  })

  it('returns empty string when no activity', () => {
    const bc = new SessionBreadcrumbs()
    expect(bc.generateContinuationContext()).toBe('')
  })
})
