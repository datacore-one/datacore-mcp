// test/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { FileCache } from '../src/cache.js'

describe('FileCache', () => {
  const tmpDir = path.join(os.tmpdir(), 'cache-test-' + Date.now())

  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('caches file data and returns from cache on second call', () => {
    const filePath = path.join(tmpDir, 'test.txt')
    fs.writeFileSync(filePath, 'hello')
    let loadCount = 0
    const cache = new FileCache<string>()
    const loader = (p: string) => { loadCount++; return fs.readFileSync(p, 'utf8') }

    const first = cache.get(filePath, loader)
    const second = cache.get(filePath, loader)

    expect(first).toBe('hello')
    expect(second).toBe('hello')
    expect(loadCount).toBe(1)
  })

  it('invalidates when file mtime changes', () => {
    const filePath = path.join(tmpDir, 'test.txt')
    fs.writeFileSync(filePath, 'v1')
    let loadCount = 0
    const cache = new FileCache<string>()
    const loader = (p: string) => { loadCount++; return fs.readFileSync(p, 'utf8') }

    cache.get(filePath, loader)

    // Modify file (need to ensure mtime actually changes)
    const originalMtime = fs.statSync(filePath).mtimeMs
    fs.writeFileSync(filePath, 'v2')
    // Force different mtime
    fs.utimesSync(filePath, new Date(), new Date(originalMtime + 2000))

    const result = cache.get(filePath, loader)
    expect(result).toBe('v2')
    expect(loadCount).toBe(2)
  })

  it('invalidates on explicit invalidate call', () => {
    const filePath = path.join(tmpDir, 'test.txt')
    fs.writeFileSync(filePath, 'hello')
    let loadCount = 0
    const cache = new FileCache<string>()
    const loader = (p: string) => { loadCount++; return fs.readFileSync(p, 'utf8') }

    cache.get(filePath, loader)
    cache.invalidate(filePath)
    cache.get(filePath, loader)
    expect(loadCount).toBe(2)
  })

  it('respects TTL expiration', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    fs.writeFileSync(filePath, 'hello')
    let loadCount = 0
    const cache = new FileCache<string>(50) // 50ms TTL
    const loader = (p: string) => { loadCount++; return fs.readFileSync(p, 'utf8') }

    cache.get(filePath, loader)
    await new Promise(r => setTimeout(r, 60))
    cache.get(filePath, loader)
    expect(loadCount).toBe(2)
  })

  it('evicts LRU entries past 100', () => {
    const cache = new FileCache<string>()
    const loader = () => 'data'

    // Add 105 entries
    for (let i = 0; i < 105; i++) {
      const fp = path.join(tmpDir, `f${i}.txt`)
      fs.writeFileSync(fp, 'x')
      cache.get(fp, loader)
    }

    expect(cache.size).toBeLessThanOrEqual(100)
  })
})
