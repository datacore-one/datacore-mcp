import {expect,it} from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {execFileSync,spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

it('ships working ESM and CommonJS runtime exports',()=>{
 const esm=pathToFileURL(path.join(process.cwd(),'dist/runtime.js')).href
 const cjs=path.join(process.cwd(),'dist/runtime.cjs')
 const check='if(z.string().parse("ok")!=="ok"||yaml.load("a: 1").a!==1)process.exit(3)'
 execFileSync(process.execPath,['--input-type=module','-e',`import {z,yaml} from ${JSON.stringify(esm)};${check}`],{timeout:10000})
 execFileSync(process.execPath,['-e',`const {z,yaml}=require(${JSON.stringify(cjs)});${check}`],{timeout:10000})
})
it('requires an explicit module-local package binding for a bare ESM runtime import',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-runtime-export-'))
 try{
  const global=path.join(root,'provider-node-modules/@datacore-one');fs.mkdirSync(global,{recursive:true})
  fs.symlinkSync(process.cwd(),path.join(global,'mcp'),'dir')
  const mod=path.join(root,'module');fs.mkdirSync(mod)
  const entry=path.join(mod,'tools.mjs');fs.writeFileSync(entry,'import {z,yaml} from "@datacore-one/mcp/runtime"; if(z.string().parse("ok")!=="ok" || yaml.load("a: 1").a!==1)process.exit(3)')
  const env={...process.env,NODE_PATH:path.dirname(global)}
  const absent=spawnSync(process.execPath,[entry],{env,encoding:'utf8',timeout:10000})
  expect(absent.status).not.toBe(0);expect(absent.stderr).toContain('ERR_MODULE_NOT_FOUND')
  const local=path.join(mod,'node_modules/@datacore-one');fs.mkdirSync(local,{recursive:true})
  fs.symlinkSync(process.cwd(),path.join(local,'mcp'),'dir')
  expect(spawnSync(process.execPath,[entry],{env,encoding:'utf8',timeout:10000}).status).toBe(0)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})
