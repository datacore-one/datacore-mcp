import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { detectStorage } from '../src/storage.js'
import { discoverModules, loadModuleTools } from '../src/modules.js'
import { handleModulesHealth } from '../src/tools/modules-health.js'

let root: string
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-compatible-context-')))
  fs.mkdirSync(path.join(root, '.datacore'))
  for (const [directory, name, type] of [['0-personal', 'personal', 'personal'], ['1-team', 'team', 'team']]) {
    const dir = path.join(root, directory, '.datacore'); fs.mkdirSync(dir, {recursive:true})
    fs.writeFileSync(path.join(dir, 'config.yaml'), `space: {name: ${name}, type: ${type}}\n`)
  }
  vi.stubEnv('DATACORE_PATH', root); vi.stubEnv('DATACORE_CORE_PATH', undefined)
  vi.stubEnv('DATACORE_SPACE', undefined); vi.stubEnv('DATACORE_SCOPED_MODULE_NAMES', undefined)
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, {recursive:true,force:true}) })
function install(scope: string, directory = 'fixture') {
  const code = path.join(root, scope, '.datacore/modules', directory)
  fs.mkdirSync(path.join(code, 'tools'), {recursive:true})
  fs.writeFileSync(path.join(code, 'module.yaml'), 'name: fixture\nprovides:\n  tools:\n    - name: identify\n')
  fs.writeFileSync(path.join(code, 'tools/index.js'), `export const tools=[{name:'identify',inputSchema:{type:'object'},handler:async(_,ctx)=>({code:ctx.modulePath, data:ctx.dataPath, space:ctx.spaceName})}];`)
  return code
}
it('keeps the legacy name and existing private data by default', async () => {
  const code = install('')
  install('1-team')
  const data = path.join(root, '0-personal/.datacore/modules/fixture/data')
  fs.mkdirSync(data, {recursive:true,mode:0o700}); fs.writeFileSync(path.join(data, 'note'), 'keep')
  const storage = detectStorage(), modules = discoverModules(storage)
  const tools = await loadModuleTools(modules, storage)
  expect(tools.map(t=>t.fullName)).toEqual(['datacore_fixture_identify'])
  expect(await tools[0].definition.handler({},tools[0].context)).toEqual({code,data,space:'personal'})
  expect(fs.readFileSync(path.join(data,'note'),'utf8')).toBe('keep')
  expect(fs.existsSync(path.join(root,'0-personal/.datacore/module-data'))).toBe(false)
  const health = await handleModulesHealth({},storage,modules) as any
  expect(health.modules.find((m:any)=>m.space==='team').selection).toBe('not-selected')
})
it('selects space > personal > global without changing the name or destination', async () => {
  install(''); const personal = install('0-personal'); const team = install('1-team')
  vi.stubEnv('DATACORE_SPACE','team')
  const storage = detectStorage(), modules = discoverModules(storage)
  for (const selected of [modules,[...modules].reverse()]) {
    const tools = await loadModuleTools(selected,storage)
    expect(tools.map(t=>t.fullName)).toEqual(['datacore_fixture_identify'])
    expect(tools[0].context.modulePath).toBe(team)
    expect(tools[0].context.spaceName).toBe('team')
  }
  const fallback = await loadModuleTools(modules.filter(m=>m.modulePath!==team),storage)
  // The physical team module still occupies the legacy path, so data remains separate.
  expect(fallback[0].context.modulePath).toBe(personal)
  expect(fallback[0].context.dataPath).toBe(path.join(root,'1-team/.datacore/module-data/fixture/data'))
})
it('does not fall back around duplicate or broken selected modules', async () => {
  install(''); const code=install('1-team'); install('1-team','duplicate')
  vi.stubEnv('DATACORE_SPACE','team')
  const storage=detectStorage()
  expect(await loadModuleTools(discoverModules(storage),storage)).toEqual([])
  fs.rmSync(path.join(root,'1-team/.datacore/modules/duplicate'),{recursive:true})
  fs.writeFileSync(path.join(code,'tools/index.js'),'throw new Error("fixture");')
  expect(await loadModuleTools(discoverModules(storage),storage)).toEqual([])
})
it('scoped names require explicit opt-in', async () => {
  install(''); install('1-team')
  vi.stubEnv('DATACORE_SCOPED_MODULE_NAMES','1')
  const storage=detectStorage()
  expect((await loadModuleTools(discoverModules(storage),storage)).map(t=>t.fullName).sort())
    .toEqual(['datacore_fixture_identify','datacore_team_fixture_identify'])
})
it.each([['DATACORE_SPACE','missing'],['DATACORE_SPACE',''],['DATACORE_SCOPED_MODULE_NAMES','true']])('rejects invalid selection %s=%s',(key,value)=>{
  vi.stubEnv(key,value); expect(()=>detectStorage()).toThrow()
})
