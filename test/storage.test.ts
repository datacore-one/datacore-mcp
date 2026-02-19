// test/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { detectStorage, initStandalone } from '../src/storage.js'

describe('detectStorage', () => {
  const tmpDir = path.join(os.tmpdir(), 'datacore-test-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    delete process.env.DATACORE_PATH
    delete process.env.DATACORE_STANDALONE_PATH
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns full mode when DATACORE_PATH points to valid installation', () => {
    const dcPath = path.join(tmpDir, 'Data')
    fs.mkdirSync(path.join(dcPath, '.datacore', 'learning'), { recursive: true })
    fs.writeFileSync(path.join(dcPath, '.datacore', 'learning', 'engrams.yaml'), 'engrams: []')
    process.env.DATACORE_PATH = dcPath

    const result = detectStorage()
    expect(result.mode).toBe('full')
    expect(result.basePath).toBe(dcPath)
  })

  it('returns standalone mode with custom path', () => {
    const standalonePath = path.join(tmpDir, 'MyDatacore')
    fs.mkdirSync(standalonePath, { recursive: true })
    fs.writeFileSync(path.join(standalonePath, 'config.yaml'), '')
    process.env.DATACORE_STANDALONE_PATH = standalonePath

    const result = detectStorage()
    expect(result.mode).toBe('standalone')
    expect(result.basePath).toBe(standalonePath)
  })

  it('returns standalone mode for fresh install', () => {
    process.env.HOME = tmpDir
    const result = detectStorage()
    expect(result.mode).toBe('standalone')
    expect(result.basePath).toBe(path.join(tmpDir, 'Datacore'))
  })
})

describe('initStandalone', () => {
  const tmpDir = path.join(os.tmpdir(), 'datacore-init-' + Date.now())

  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('creates standalone directory structure', () => {
    const standalonePath = path.join(tmpDir, 'Datacore')
    initStandalone(standalonePath)

    expect(fs.existsSync(path.join(standalonePath, 'journal'))).toBe(true)
    expect(fs.existsSync(path.join(standalonePath, 'knowledge'))).toBe(true)
    expect(fs.existsSync(path.join(standalonePath, 'packs'))).toBe(true)
    expect(fs.existsSync(path.join(standalonePath, 'engrams.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(standalonePath, 'config.yaml'))).toBe(true)
  })

  it('does not overwrite existing files', () => {
    const standalonePath = path.join(tmpDir, 'Datacore')
    fs.mkdirSync(standalonePath, { recursive: true })
    fs.writeFileSync(path.join(standalonePath, 'config.yaml'), 'custom: true')

    initStandalone(standalonePath)

    const content = fs.readFileSync(path.join(standalonePath, 'config.yaml'), 'utf8')
    expect(content).toBe('custom: true')
  })

  it('copies starter packs during initialization', () => {
    const standalonePath = path.join(tmpDir, 'Datacore')
    initStandalone(standalonePath)

    expect(fs.existsSync(path.join(standalonePath, 'packs', 'datacore-starter-v1', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(standalonePath, 'packs', 'fds-principles-v1', 'SKILL.md'))).toBe(true)
  })
})
