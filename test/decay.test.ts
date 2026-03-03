// test/decay.test.ts
import { describe, it, expect } from 'vitest'
import { decayedStrength, decayedCoAccessStrength, engramState } from '../src/decay.js'

describe('decayedStrength', () => {
  const base = 0.8
  const today = new Date('2026-02-21')

  it('returns unchanged strength for 0 days', () => {
    expect(decayedStrength(base, '2026-02-21', today)).toBeCloseTo(0.8, 2)
  })

  it('decays over 14 days (~0.396)', () => {
    const result = decayedStrength(base, '2026-02-07', today)
    expect(result).toBeCloseTo(0.397, 2)
  })

  it('floors at 0.05 after 60 days', () => {
    const result = decayedStrength(base, '2025-12-23', today)
    expect(result).toBe(0.05)
  })

  it('handles future last_accessed (0 days)', () => {
    const result = decayedStrength(base, '2026-02-25', today)
    expect(result).toBeCloseTo(0.8, 2)
  })

  it('defaults to current date when now is omitted', () => {
    const recent = new Date().toISOString().split('T')[0]
    const result = decayedStrength(base, recent)
    expect(result).toBeCloseTo(0.8, 1)
  })
})

describe('decayedCoAccessStrength', () => {
  const today = new Date('2026-02-21')

  it('returns unchanged strength for 0 days', () => {
    expect(decayedCoAccessStrength(0.5, '2026-02-21', today)).toBeCloseTo(0.5, 2)
  })

  it('decays over 14 days', () => {
    const result = decayedCoAccessStrength(0.5, '2026-02-07', today)
    expect(result).toBeCloseTo(0.248, 2)
  })

  it('returns 0 below prune threshold', () => {
    // Very old association should decay below threshold
    expect(decayedCoAccessStrength(0.1, '2025-12-01', today)).toBe(0)
  })

  it('accepts custom decay rate and prune threshold', () => {
    const result = decayedCoAccessStrength(0.5, '2026-02-14', today, 0.1, 0.01)
    // 7 days at rate 0.1: 0.5 * exp(-0.1 * 7) = ~0.248
    expect(result).toBeCloseTo(0.248, 2)
  })

  it('returns 0 for strength below custom threshold', () => {
    expect(decayedCoAccessStrength(0.02, '2026-02-20', today, 0.05, 0.05)).toBe(0)
  })
})

describe('engramState', () => {
  it('returns active for RS >= 0.5', () => {
    expect(engramState(0.5)).toBe('active')
    expect(engramState(0.8)).toBe('active')
  })

  it('returns fading for 0.3 <= RS < 0.5', () => {
    expect(engramState(0.3)).toBe('fading')
    expect(engramState(0.49)).toBe('fading')
  })

  it('returns dormant for 0.1 <= RS < 0.3', () => {
    expect(engramState(0.1)).toBe('dormant')
    expect(engramState(0.29)).toBe('dormant')
  })

  it('returns retirement_candidate for RS < 0.1', () => {
    expect(engramState(0.05)).toBe('retirement_candidate')
    expect(engramState(0.09)).toBe('retirement_candidate')
  })
})
