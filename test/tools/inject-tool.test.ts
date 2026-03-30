// test/tools/inject-tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { handleInject } from '../../src/tools/inject-tool.js'
import { getPlur, resetPlur } from '../../src/plur-bridge.js'
import { resetConfigCache } from '../../src/config.js'

describe('datacore.inject (PLUR-backed)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-test-'))
    process.env.PLUR_PATH = tmpDir
    resetPlur()
    resetConfigCache()
  })

  afterEach(() => {
    delete process.env.PLUR_PATH
    resetPlur()
    resetConfigCache()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns matching engrams for a task', async () => {
    const plur = getPlur()
    plur.learn('Always validate data ownership before processing', {
      type: 'behavioral',
      tags: ['data', 'ownership'],
    })

    const result = await handleInject({ prompt: 'design a data model for user ownership' })
    expect(result.count).toBeGreaterThan(0)
    expect(result.text).toContain('validate data ownership')
    expect(result.tokens_used).toBeGreaterThan(0)
  })

  it('returns empty when no match', async () => {
    // No engrams seeded — empty store
    const result = await handleInject({ prompt: 'fix CSS margin issue' })
    expect(result.count).toBe(0)
    expect(result.text).toBe('')
    expect(result.tokens_used).toBe(0)
    expect(result.injected_personal_ids).toEqual([])
  })

  it('returns injected_personal_ids array', async () => {
    const plur = getPlur()
    plur.learn('Use repository pattern for data access', { type: 'architectural' })
    plur.learn('Prefer composition over inheritance', { type: 'architectural' })

    const result = await handleInject({ prompt: 'design a data access layer with repository pattern' })
    expect(result.count).toBeGreaterThan(0)
    expect(result.injected_personal_ids).toBeInstanceOf(Array)
    for (const id of result.injected_personal_ids) {
      expect(id).toMatch(/^ENG-/)
    }
  })

  it('returns hints', async () => {
    const plur = getPlur()
    plur.learn('Test hint generation', { type: 'behavioral' })

    const result = await handleInject({ prompt: 'test hint generation' })
    expect(result._hints).toBeDefined()
    expect(result._hints?.related).toContain('datacore.feedback')
    expect(result._hints?.related).toContain('datacore.session.end')
  })
})
