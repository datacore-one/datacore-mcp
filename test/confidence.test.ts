import { describe, it, expect } from 'vitest'
import { computeConfidence } from '../src/confidence.js'

describe('computeConfidence', () => {
  it('returns 0.5 for engram with no feedback', () => {
    expect(computeConfidence({
      feedback_signals: { positive: 0, negative: 0, neutral: 0 },
      consolidated: false,
    })).toBeCloseTo(0.5, 1)
  })

  it('increases with positive feedback', () => {
    expect(computeConfidence({
      feedback_signals: { positive: 5, negative: 0, neutral: 0 },
      consolidated: false,
    })).toBeGreaterThan(0.7)
  })

  it('decreases with negative feedback', () => {
    expect(computeConfidence({
      feedback_signals: { positive: 0, negative: 3, neutral: 0 },
      consolidated: false,
    })).toBeLessThan(0.4)
  })

  it('is bounded between 0 and 1', () => {
    const high = computeConfidence({ feedback_signals: { positive: 100, negative: 0, neutral: 0 }, consolidated: false })
    const low = computeConfidence({ feedback_signals: { positive: 0, negative: 100, neutral: 0 }, consolidated: false })
    expect(high).toBeLessThanOrEqual(1.0)
    expect(low).toBeGreaterThanOrEqual(0.0)
  })

  it('boosts consolidated engrams', () => {
    const base = { feedback_signals: { positive: 2, negative: 0, neutral: 0 } }
    const unconsolidated = computeConfidence({ ...base, consolidated: false })
    const consolidated = computeConfidence({ ...base, consolidated: true })
    expect(consolidated).toBeGreaterThan(unconsolidated)
  })

  it('dampens confidence when sample size is small', () => {
    const oneVote = computeConfidence({ feedback_signals: { positive: 1, negative: 0, neutral: 0 }, consolidated: false })
    const tenVotes = computeConfidence({ feedback_signals: { positive: 10, negative: 0, neutral: 0 }, consolidated: false })
    expect(tenVotes).toBeGreaterThan(oneVote)
  })

  it('handles undefined feedback_signals gracefully', () => {
    expect(computeConfidence({ consolidated: false })).toBeCloseTo(0.5, 1)
  })
})
