// test/engrams.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadEngrams, saveEngrams, loadPack } from '../src/engrams.js'

describe('loadEngrams', () => {
  const tmpDir = path.join(os.tmpdir(), 'engrams-test-' + Date.now())

  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('returns empty array for missing file', () => {
    const result = loadEngrams(path.join(tmpDir, 'missing.yaml'))
    expect(result).toEqual([])
  })

  it('returns empty array for file with empty engrams list', () => {
    const filePath = path.join(tmpDir, 'engrams.yaml')
    fs.writeFileSync(filePath, 'engrams: []\n')
    expect(loadEngrams(filePath)).toEqual([])
  })

  it('loads and validates engrams from YAML', () => {
    const filePath = path.join(tmpDir, 'engrams.yaml')
    fs.writeFileSync(filePath, `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    statement: "Test engram"
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-02-19"
`)
    const result = loadEngrams(filePath)
    expect(result).toHaveLength(1)
    expect(result[0].statement).toBe('Test engram')
  })

  it('skips invalid engrams and logs warning', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const filePath = path.join(tmpDir, 'engrams.yaml')
    fs.writeFileSync(filePath, `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    statement: "Valid"
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-02-19"
  - id: bad
    status: invalid
`)
    expect(loadEngrams(filePath)).toHaveLength(1)
    const logged = stderrSpy.mock.calls.map(c => c[0] as string).join('')
    expect(logged).toContain('Skipped 1 invalid engram')
    stderrSpy.mockRestore()
  })

  it('logs error for corrupted YAML', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const filePath = path.join(tmpDir, 'engrams.yaml')
    fs.writeFileSync(filePath, ': [invalid yaml : {{{}}}')
    const result = loadEngrams(filePath)
    expect(result).toEqual([])
    const logged = stderrSpy.mock.calls.map(c => c[0] as string).join('')
    expect(logged).toContain('Failed to parse engrams file')
    stderrSpy.mockRestore()
  })
})

describe('saveEngrams', () => {
  const tmpDir = path.join(os.tmpdir(), 'engrams-save-' + Date.now())
  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('round-trips engrams through save/load', () => {
    const filePath = path.join(tmpDir, 'engrams.yaml')
    const engrams = [{
      id: 'ENG-2026-0219-001',
      version: 2 as const,
      status: 'active' as const,
      type: 'behavioral' as const,
      scope: 'global',
      visibility: 'private' as const,
      statement: 'Test',
      activation: { retrieval_strength: 0.8, storage_strength: 0.5, frequency: 3, last_accessed: '2026-02-19' },
      tags: [], consolidated: false, derivation_count: 1,
      pack: null, abstract: null, derived_from: null,
    }]
    saveEngrams(filePath, engrams)
    const loaded = loadEngrams(filePath)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].statement).toBe('Test')
  })
})

describe('loadPack', () => {
  const tmpDir = path.join(os.tmpdir(), 'pack-test-' + Date.now())
  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('loads manifest from SKILL.md frontmatter + engrams from YAML', () => {
    const packDir = path.join(tmpDir, 'test-pack')
    fs.mkdirSync(packDir, { recursive: true })

    fs.writeFileSync(path.join(packDir, 'SKILL.md'), `---
name: Test Pack
description: A test pack
version: "1.0.0"
creator: Test
license: cc-by-sa-4.0
tags: [test]
x-datacore:
  id: test-pack
  injection_policy: on_match
  match_terms: [test, example]
  engram_count: 1
---

# Test Pack

This is a test pack.
`)
    fs.writeFileSync(path.join(packDir, 'engrams.yaml'), `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    statement: "Pack engram"
    pack: test-pack
    activation:
      retrieval_strength: 0.9
      storage_strength: 0.9
      frequency: 0
      last_accessed: "2026-02-19"
`)
    const result = loadPack(packDir)
    expect(result.manifest.name).toBe('Test Pack')
    expect(result.manifest['x-datacore'].id).toBe('test-pack')
    expect(result.manifest['x-datacore'].injection_policy).toBe('on_match')
    expect(result.engrams).toHaveLength(1)
  })
})
