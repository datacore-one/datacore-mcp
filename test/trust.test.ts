// test/trust.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { computePackChecksum, verifyPackChecksum } from '../src/trust.js'

describe('pack checksum', () => {
  const tmpDir = path.join(os.tmpdir(), 'trust-test-' + Date.now())

  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('computes SHA-256 from SKILL.md and engrams.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Test Pack')
    fs.writeFileSync(path.join(tmpDir, 'engrams.yaml'), 'engrams: []')
    const checksum = computePackChecksum(tmpDir)
    expect(checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns null for empty directory', () => {
    const emptyDir = path.join(tmpDir, 'empty')
    fs.mkdirSync(emptyDir)
    expect(computePackChecksum(emptyDir)).toBeNull()
  })

  it('verifies matching checksum', () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Test Pack')
    fs.writeFileSync(path.join(tmpDir, 'engrams.yaml'), 'engrams: []')
    const checksum = computePackChecksum(tmpDir)!
    const result = verifyPackChecksum(tmpDir, checksum)
    expect(result.valid).toBe(true)
  })

  it('detects tampered content', () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Test Pack')
    fs.writeFileSync(path.join(tmpDir, 'engrams.yaml'), 'engrams: []')
    const result = verifyPackChecksum(tmpDir, 'deadbeef'.repeat(8))
    expect(result.valid).toBe(false)
  })
})
