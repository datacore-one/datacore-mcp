import {expect,it} from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {execFileSync} from 'node:child_process'

it('cannot delete another entry point after it publishes its artifact',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-build-race-'))
 try{
  const directory=path.join(process.cwd(),'node_modules/tsup/dist')
  const helper=fs.readdirSync(directory).filter(name=>name.startsWith('chunk-')&&name.endsWith('.js'))
   .map(name=>path.join(directory,name)).find(name=>/exports\.removeFiles\s*=/.test(fs.readFileSync(name,'utf8')))
  expect(helper).toBeTruthy()
  const hook=path.join(root,'delay-clean.cjs')
  fs.writeFileSync(hook,`const c=require(${JSON.stringify(helper)});const original=c.removeFiles;c.removeFiles=async(...args)=>{await new Promise(r=>setTimeout(r,200));return original(...args)};`)
  execFileSync(process.execPath,['--require',hook,'scripts/build.mjs'],{
   env:{...process.env,NODE_OPTIONS:`--require ${hook}`},timeout:30000,stdio:'pipe'})
  for(const entry of ['index.js','runtime.js','runtime.cjs'])expect(fs.statSync(path.join(process.cwd(),'dist',entry)).size).toBeGreaterThan(0)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
},35000)
