// test/tools/inject-tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleInject } from '../../src/tools/inject-tool.js'

describe('datacore.inject tool', () => {
  const tmpDir = path.join(os.tmpdir(), 'inject-tool-test-' + Date.now())
  const engramsPath = path.join(tmpDir, 'engrams.yaml')
  const packsDir = path.join(tmpDir, 'packs')

  beforeEach(() => {
    fs.mkdirSync(packsDir, { recursive: true })
    fs.writeFileSync(engramsPath, `engrams:
  - id: ENG-2026-0219-001
    version: 2
    status: active
    type: behavioral
    scope: global
    visibility: private
    statement: "Always validate data ownership before processing"
    tags: [data, ownership]
    activation:
      retrieval_strength: 0.8
      storage_strength: 0.5
      frequency: 3
      last_accessed: "2026-02-19"
`)
  })
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('returns formatted injection text with matching engrams', async () => {
    const result = await handleInject(
      { prompt: 'design a data model for user ownership' },
      { engramsPath, packsPath: packsDir },
    )
    expect(result.text).toContain('validate data ownership')
    expect(result.count).toBeGreaterThan(0)
  })

  it('returns empty when nothing matches', async () => {
    const result = await handleInject(
      { prompt: 'fix CSS margin issue' },
      { engramsPath, packsPath: packsDir },
    )
    expect(result.count).toBe(0)
    expect(result.text).toBe('')
  })
})
