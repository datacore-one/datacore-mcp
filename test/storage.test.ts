// test/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { detectStorage, initCore } from '../src/storage.js'

describe('detectStorage', () => {
  const tmpDir = path.join(os.tmpdir(), 'datacore-test-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    delete process.env.DATACORE_PATH
    delete process.env.DATACORE_CORE_PATH
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

  it('returns core mode with custom path', () => {
    const corePath = path.join(tmpDir, 'MyDatacore')
    fs.mkdirSync(corePath, { recursive: true })
    fs.writeFileSync(path.join(corePath, 'config.yaml'), '')
    process.env.DATACORE_CORE_PATH = corePath

    const result = detectStorage()
    expect(result.mode).toBe('core')
    expect(result.basePath).toBe(corePath)
  })

  it('returns core mode for fresh install', () => {
    process.env.HOME = tmpDir
    const result = detectStorage()
    expect(result.mode).toBe('core')
    expect(result.basePath).toBe(path.join(tmpDir, 'Datacore'))
  })
})

describe('initCore', () => {
  const tmpDir = path.join(os.tmpdir(), 'datacore-init-' + Date.now())

  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('creates core directory structure', () => {
    const corePath = path.join(tmpDir, 'Datacore')
    initCore(corePath)

    expect(fs.existsSync(path.join(corePath, 'journal'))).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'knowledge'))).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'packs'))).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'engrams.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'config.yaml'))).toBe(true)
  })

  it('returns isFirstRun true for fresh install', () => {
    const corePath = path.join(tmpDir, 'Fresh')
    const result = initCore(corePath)
    expect(result.isFirstRun).toBe(true)
  })

  it('returns isFirstRun false when engrams.yaml exists', () => {
    const corePath = path.join(tmpDir, 'Existing')
    fs.mkdirSync(corePath, { recursive: true })
    fs.writeFileSync(path.join(corePath, 'engrams.yaml'), 'engrams: []\n')
    const result = initCore(corePath)
    expect(result.isFirstRun).toBe(false)
  })

  it('does not overwrite existing files', () => {
    const corePath = path.join(tmpDir, 'Datacore')
    fs.mkdirSync(corePath, { recursive: true })
    fs.writeFileSync(path.join(corePath, 'config.yaml'), 'custom: true')

    initCore(corePath)

    const content = fs.readFileSync(path.join(corePath, 'config.yaml'), 'utf8')
    expect(content).toBe('custom: true')
  })

  it('copies starter packs during initialization', () => {
    const corePath = path.join(tmpDir, 'Datacore')
    initCore(corePath)

    expect(fs.existsSync(path.join(corePath, 'packs', 'datacore-starter-v1', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'packs', 'fds-principles-v1', 'SKILL.md'))).toBe(true)
  })
})
