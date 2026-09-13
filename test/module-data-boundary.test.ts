import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { detectStorage } from '../src/storage.js'
import { discoverModules, loadModuleTools } from '../src/modules.js'
import { moduleDataPath } from '../src/module-data.js'
import { execFileSync } from 'node:child_process'
let fixture: string, root: string
beforeEach(() => {
  fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-module-data-')))
  root = path.join(fixture, 'install')
  fs.mkdirSync(path.join(root, '.datacore'), { recursive: true })
  vi.stubEnv('DATACORE_PATH', root); vi.stubEnv('DATACORE_CORE_PATH', undefined)
})

it.each(['data', 'state', 'settings.local.yaml'])('does not silently supersede legacy %s', component => {
  const code = path.join(fixture, 'code'), legacy = path.join(code, component)
  fs.mkdirSync(code)
  fs.writeFileSync(legacy, 'preserve existing private bytes')
  expect(() => moduleDataPath(root, 'fixture', code, 'self')).toThrow(/migration/)
  expect(fs.readFileSync(legacy, 'utf8')).toBe('preserve existing private bytes')
  expect(fs.existsSync(path.join(root, '.datacore/module-data/fixture'))).toBe(false)
})

it('does not reuse a linked or public private-data root', () => {
  const code = path.join(fixture, 'code'); fs.mkdirSync(code)
  const parent = path.join(root, '.datacore/module-data'); fs.mkdirSync(parent, {mode:0o700})
  fs.symlinkSync(code, path.join(parent, 'fixture'))
  expect(() => moduleDataPath(root, 'fixture', code, 'self')).toThrow()
  fs.unlinkSync(path.join(parent, 'fixture'))
  fs.mkdirSync(path.join(parent, 'fixture'), {mode:0o755})
  fs.chmodSync(path.join(parent, 'fixture'), 0o755)
  expect(() => moduleDataPath(root, 'fixture', code, 'self')).toThrow(/private/)
  expect(fs.readdirSync(code)).toEqual([])
})

it('rejects dangling legacy state links instead of treating them as absent', () => {
  const code = path.join(fixture, 'code'); fs.mkdirSync(code)
  fs.symlinkSync(path.join(fixture, 'missing'), path.join(code, 'data'))
  expect(() => moduleDataPath(root, 'fixture', code, 'self')).toThrow(/migration/)
})

it('refuses incomplete migration even after every original has been retired', () => {
  const code = path.join(fixture, 'code'); fs.mkdirSync(code)
  const target = path.join(root, '.datacore/module-data/fixture')
  fs.mkdirSync(target, { recursive: true, mode: 0o700 })
  fs.chmodSync(path.dirname(target), 0o700)
  fs.writeFileSync(path.join(target, '.migration.json'), JSON.stringify({version:1,status:'staged',module:'fixture',space:'self'}))
  expect(() => moduleDataPath(root, 'fixture', code, 'self')).toThrow(/incomplete/)
  fs.writeFileSync(path.join(target, '.migration.json'), JSON.stringify({version:1,status:'complete',module:'fixture',space:'self'}))
  expect(moduleDataPath(root, 'fixture', code, 'self')).toBe(path.join(target, 'data'))
  expect(() => moduleDataPath(root, 'fixture', code, 'another-space')).toThrow(/incomplete/)
})

it('the installed migration preserves legacy bytes and enables the real module context', async () => {
  fs.writeFileSync(path.join(root, '.datacore/config.yaml'), 'space: {name: self, type: personal}\n')
  const code = path.join(root, '.datacore/modules/fixture')
  fs.mkdirSync(path.join(code, 'tools'), {recursive:true})
  fs.mkdirSync(path.join(code, 'data'))
  fs.writeFileSync(path.join(code, 'data/private.txt'), 'retained prior note')
  fs.writeFileSync(path.join(code, 'module.yaml'), 'name: fixture\nprovides:\n  tools:\n    - name: read\n')
  fs.writeFileSync(path.join(code, 'tools/index.js'), `import * as fs from 'node:fs';import * as path from 'node:path';
    export const tools=[{name:'read',inputSchema:{type:'object'},handler:async(_,ctx)=>fs.readFileSync(path.join(ctx.dataPath,'private.txt'),'utf8')}];`)
  const storage = detectStorage()
  expect(await loadModuleTools(discoverModules(storage), storage)).toEqual([])
  const python = process.env.DATACORE_PYTHON!, lib = process.env.DATACORE_LIB!
  const result = JSON.parse(execFileSync(python, ['-I', path.join(lib, 'module_data_migrate.py'),
    '--root', root, '--space', 'self', '--module', 'fixture', '--source', code, '--quiesced'], {encoding:'utf8',timeout:10000}))
  expect(result.status).toBe('complete')
  const tools = await loadModuleTools(discoverModules(storage), storage)
  expect(tools).toHaveLength(1)
  expect(await tools[0].definition.handler({}, tools[0].context)).toBe('retained prior note')
  expect(fs.existsSync(path.join(code, 'data'))).toBe(false)
  expect(fs.readFileSync(path.join(code, 'module.yaml'), 'utf8')).toContain('name: fixture')
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }) })

it.each(['scoped-copy', 'scoped-link', 'root-link'])('module writes stay outside shareable code for %s', async variant => {
  const space = variant === 'root-link' ? root : path.join(root, 'named-personal')
  fs.mkdirSync(path.join(space, '.datacore/modules'), { recursive: true })
  fs.writeFileSync(path.join(space, '.datacore/config.yaml'), 'space: {name: self, type: personal}\n')
  const installed = path.join(space, '.datacore/modules/fixture')
  const code = variant.endsWith('link') ? path.join(fixture, 'provider-code') : installed
  fs.mkdirSync(path.join(code, 'tools'), { recursive: true })
  fs.mkdirSync(path.join(code, '.git'))
  fs.writeFileSync(path.join(code, 'module.yaml'), 'name: fixture\nprovides:\n  tools:\n    - name: record\n')
  fs.writeFileSync(path.join(code, 'tools/index.js'), `import * as fs from 'node:fs';import * as path from 'node:path';
    export const tools=[{name:'record',inputSchema:{type:'object'},handler:async(_,ctx)=>{
      fs.mkdirSync(ctx.dataPath,{recursive:true});fs.writeFileSync(path.join(ctx.dataPath,'private.txt'),'synthetic private note');return ctx.dataPath;
    }}];`)
  if (code !== installed) fs.symlinkSync(code, installed, 'dir')
  const storage = detectStorage(), tools = await loadModuleTools(discoverModules(storage), storage)
  expect(tools).toHaveLength(1)
  const destination = await tools[0].definition.handler({}, tools[0].context) as string
  expect(fs.readFileSync(path.join(destination, 'private.txt'), 'utf8')).toBe('synthetic private note')
  expect(fs.existsSync(path.join(code, 'data/private.txt'))).toBe(false)
  expect(fs.realpathSync(destination).startsWith(space + path.sep)).toBe(true)
})
