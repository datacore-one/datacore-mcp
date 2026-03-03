import { describe, it, expect, beforeEach } from 'vitest'
import { SessionTracker } from '../src/session-tracker.js'

describe('SessionTracker', () => {
  let tracker: SessionTracker

  beforeEach(() => {
    tracker = new SessionTracker()
  })

  it('tracks injected IDs for a session', () => {
    tracker.trackInjected('s1', ['ENG-2026-0101-001', 'ENG-2026-0101-002'])
    expect(tracker.getInjectedIds('s1')).toEqual(
      expect.arrayContaining(['ENG-2026-0101-001', 'ENG-2026-0101-002']),
    )
  })

  it('accumulates IDs across multiple trackInjected calls', () => {
    tracker.trackInjected('s1', ['ENG-2026-0101-001'])
    tracker.trackInjected('s1', ['ENG-2026-0101-002', 'ENG-2026-0101-003'])
    expect(tracker.getInjectedIds('s1')).toHaveLength(3)
  })

  it('deduplicates IDs', () => {
    tracker.trackInjected('s1', ['ENG-2026-0101-001', 'ENG-2026-0101-001'])
    tracker.trackInjected('s1', ['ENG-2026-0101-001'])
    expect(tracker.getInjectedIds('s1')).toHaveLength(1)
  })

  it('generates co-access pairs from 3 IDs', () => {
    tracker.trackInjected('s1', ['A', 'B', 'C'])
    const pairs = tracker.getCoAccessPairs('s1')
    expect(pairs).toEqual([['A', 'B'], ['A', 'C'], ['B', 'C']])
  })

  it('returns empty pairs for single ID', () => {
    tracker.trackInjected('s1', ['A'])
    expect(tracker.getCoAccessPairs('s1')).toEqual([])
  })

  it('returns empty pairs for unknown session', () => {
    expect(tracker.getCoAccessPairs('unknown')).toEqual([])
  })

  it('isolates sessions', () => {
    tracker.trackInjected('s1', ['A', 'B'])
    tracker.trackInjected('s2', ['C', 'D'])
    expect(tracker.getInjectedIds('s1')).toEqual(expect.arrayContaining(['A', 'B']))
    expect(tracker.getInjectedIds('s2')).toEqual(expect.arrayContaining(['C', 'D']))
  })

  it('clears a session', () => {
    tracker.trackInjected('s1', ['A', 'B'])
    tracker.clear('s1')
    expect(tracker.getInjectedIds('s1')).toEqual([])
    expect(tracker.getCoAccessPairs('s1')).toEqual([])
  })

  it('ignores empty engramIds', () => {
    tracker.trackInjected('s1', [])
    expect(tracker.size).toBe(0)
  })

  it('ignores empty sessionId', () => {
    tracker.trackInjected('', ['A'])
    expect(tracker.size).toBe(0)
  })
})
