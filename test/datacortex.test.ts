// test/datacortex.test.ts
import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import { DatacortexBridge } from '../src/datacortex.js'

describe('DatacortexBridge', () => {
  it('reports unavailable when bridge script not found', () => {
    const bridge = new DatacortexBridge(path.join(os.tmpdir(), 'nonexistent'))
    const status = bridge.isAvailable()
    expect(status.available).toBe(false)
    expect(status.reason).toContain('not found')
  })

  it('falls back gracefully when unavailable', async () => {
    const bridge = new DatacortexBridge(path.join(os.tmpdir(), 'nonexistent'))
    const result = await bridge.search('test query')
    expect(result.results).toEqual([])
    expect(result.fallback).toBe(true)
  })
})
