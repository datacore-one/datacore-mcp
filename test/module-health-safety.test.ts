import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {discoverModules,loadModuleTools,moduleLoadErrors} from '../src/modules.js'
import {handleModulesHealth} from '../src/tools/modules-health.js'
import {logger} from '../src/logger.js'
let root:string,storage:any
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-module-health-'));storage={mode:'full',basePath:root};moduleLoadErrors.clear()})
afterEach(()=>{vi.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true});moduleLoadErrors.clear()})
function moduleAt(scope:string, source:string){
 const target=path.join(root,scope,'.datacore/modules/fixture');fs.mkdirSync(path.join(target,'tools'),{recursive:true})
 fs.writeFileSync(path.join(target,'module.yaml'),'name: fixture\nmanifest_version: 2\nprovides:\n  tools:\n    - name: identify\n')
 fs.writeFileSync(path.join(target,'SKILL.md'),'Fixture');fs.writeFileSync(path.join(target,'CLAUDE.base.md'),'Fixture')
 fs.writeFileSync(path.join(target,'tools/index.js'),source)
}
const good='export const tools=[{name:"identify",description:"fixture",inputSchema:{type:"object",properties:{}},handler:async()=>({ok:true})}]'
it('one scoped import failure cannot poison a healthy sibling or leak diagnostics',async()=>{
 moduleAt('',good);moduleAt('1-team','throw new Error("PRIVATE SYNTHETIC CREDENTIAL");')
 const warnings=vi.spyOn(logger,'warning').mockImplementation(()=>{})
 const modules=discoverModules(storage)
 const tools=await loadModuleTools(modules,storage)
 expect(tools.some(t=>t.fullName==='datacore_fixture_identify')).toBe(true)
 const result=await handleModulesHealth({},storage,modules) as any
 expect(result.modules[0].issues.some((i:any)=>i.code==='TOOLS_LOAD_FAILED')).toBe(false)
 expect(result.modules[1].issues.some((i:any)=>i.code==='TOOLS_LOAD_FAILED')).toBe(true)
 expect(JSON.stringify([result,warnings.mock.calls,[...moduleLoadErrors.values()]])).not.toContain('PRIVATE SYNTHETIC')
})
it('does not silently choose a health result by discovery order',async()=>{
 moduleAt('',good);moduleAt('1-team',good)
 const result=await handleModulesHealth({module:'fixture'},storage) as any
 expect(result.error).toMatch(/ambiguous/i)
})
it('does not claim a named export is a registered array tool',async()=>{
 moduleAt('','export async function identify(){return {ok:true}}')
 const modules=discoverModules(storage)
 expect(await loadModuleTools(modules,storage)).toEqual([])
 const result=await handleModulesHealth({module:'fixture'},storage,modules) as any
 expect(result.issues.some((i:any)=>i.code==='TOOL_HANDLER_MISSING')).toBe(true)
})
