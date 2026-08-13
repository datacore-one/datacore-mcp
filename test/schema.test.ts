// test/schema.test.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { toJsonSchema, validateArgs, isZodSchema } from '../src/schema.js'

describe('schema tolerance', () => {
  it('converts a Zod schema', () => {
    const out = toJsonSchema(z.object({ a: z.string() })) as Record<string, unknown>
    expect(out.type).toBe('object')
  })

  it('passes a plain JSON Schema through untouched', () => {
    // The exact shape skills-library exported, which took down tools/list.
    const json = { type: 'object', properties: { skill: { type: 'string' } } }
    expect(toJsonSchema(json)).toEqual(json)
  })

  it('throws only for something that is neither', () => {
    expect(() => toJsonSchema(undefined)).toThrow()
    expect(() => toJsonSchema('nonsense')).toThrow()
  })

  it('distinguishes Zod from JSON Schema', () => {
    expect(isZodSchema(z.object({}))).toBe(true)
    expect(isZodSchema({ type: 'object' })).toBe(false)
  })

  it('validates with Zod but passes JSON-Schema args through', () => {
    expect(validateArgs(z.object({ a: z.string() }), { a: 'x' })).toEqual({ a: 'x' })
    expect(() => validateArgs(z.object({ a: z.string() }), { a: 1 })).toThrow()
    const args = { anything: true }
    expect(validateArgs({ type: 'object' }, args)).toBe(args)
  })
})
