// test/version.test.ts
import { describe, it, expect, vi } from 'vitest'
import { checkForUpdate } from '../src/version.js'

describe('checkForUpdate', () => {
  it('returns null when fetch fails (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const result = await checkForUpdate()
    expect(result).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns null when already on latest version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '0.1.0' }),
    }))
    const result = await checkForUpdate()
    expect(result).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns new version when update available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '0.2.0' }),
    }))
    const result = await checkForUpdate()
    expect(result).toBe('0.2.0')
    vi.unstubAllGlobals()
  })
})
