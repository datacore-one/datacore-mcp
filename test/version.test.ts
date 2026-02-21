// test/version.test.ts
import { describe, it, expect, vi } from 'vitest'
import { checkForUpdate, currentVersion } from '../src/version.js'

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
      json: async () => ({ version: currentVersion }),
    }))
    const result = await checkForUpdate()
    expect(result).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns new version when update available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.1.0' }),
    }))
    const result = await checkForUpdate()
    expect(result).toBe('1.1.0')
    vi.unstubAllGlobals()
  })
})
