// src/__tests__/fts.test.ts
import { describe, it, expect } from 'vitest'
import { tokenizeQuery } from '../fts.js'

describe('tokenizeQuery', () => {
  it('splits multi-word query into AND terms', () => {
    expect(tokenizeQuery('SOL trading framework')).toBe('SOL AND trading AND framework')
  })

  it('filters words shorter than 2 chars but keeps 2-char terms', () => {
    expect(tokenizeQuery('a is the trading')).toBe('is AND the AND trading')
  })

  it('keeps common short technical terms', () => {
    expect(tokenizeQuery('AI governance')).toBe('AI AND governance')
  })

  it('preserves quoted phrases', () => {
    expect(tokenizeQuery('"position health" score')).toBe('"position health" AND score')
  })

  it('handles single word', () => {
    expect(tokenizeQuery('trading')).toBe('trading')
  })

  it('strips non-alphanumeric chars', () => {
    expect(tokenizeQuery('HRV! sleep?')).toBe('HRV AND sleep')
  })

  it('returns original for very short queries', () => {
    expect(tokenizeQuery('AI')).toBe('AI')
  })
})
