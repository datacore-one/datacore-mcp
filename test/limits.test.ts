// test/limits.test.ts
import { describe, it, expect } from 'vitest'
import { validateContent, validateTitle, MAX_CONTENT_SIZE, MAX_TITLE_LENGTH } from '../src/limits.js'

describe('validateContent', () => {
  it('accepts content within limit', () => {
    expect(validateContent('hello')).toBeNull()
  })

  it('rejects content exceeding 1MB', () => {
    const big = 'x'.repeat(MAX_CONTENT_SIZE + 1)
    expect(validateContent(big)).toContain('too large')
  })
})

describe('validateTitle', () => {
  it('accepts short title', () => {
    expect(validateTitle('My Note')).toBeNull()
  })

  it('rejects title exceeding 200 characters', () => {
    const long = 'a'.repeat(MAX_TITLE_LENGTH + 1)
    expect(validateTitle(long)).toContain('too long')
  })
})
