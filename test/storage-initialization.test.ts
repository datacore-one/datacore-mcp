import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { buildSync } from 'esbuild'
vi.mock('node:fs', async importOriginal => ({...await importOriginal<typeof import('node:fs')>()}))
import { initCore } from '../src/storage.js'

let root:string
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-init-preserve-'))})
afterEach(()=>{vi.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true})})

it('preserves an engram store created immediately before initial publication',()=>{
  const target=path.join(root,'engrams.yaml'), original='engrams:\n  - id: preserve-me\n'
  const link=fs.linkSync
  vi.spyOn(fs,'linkSync').mockImplementation((source,dest)=>{
    if(String(dest)===fs.realpathSync(root)+'/engrams.yaml'&&!fs.existsSync(target))fs.writeFileSync(target,original)
    return link(source,dest)
  })
  expect(initCore(root).isFirstRun).toBe(false)
  expect(fs.readFileSync(target,'utf8')).toBe(original)
})
it('refuses linked configuration instead of following it outside the store',()=>{
  const external=path.join(root,'outside.yaml');fs.writeFileSync(external,'private: preserved\n')
  fs.symlinkSync(external,path.join(root,'config.yaml'))
  expect(()=>initCore(root)).toThrow()
  expect(fs.readFileSync(external,'utf8')).toBe('private: preserved\n')
})
it('simultaneous initialization publishes one complete store and preserves user edits',async()=>{
  const bundle=path.join(root,'initialize.cjs'), destination=path.join(root,'selected')
  buildSync({stdin:{contents:`import {initCore} from './src/storage.ts';process.stdout.write(JSON.stringify(initCore(process.argv[2])));`,resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['better-sqlite3'],define:{'import.meta.url':JSON.stringify(pathToFileURL(path.join(process.cwd(),'src/storage.ts')).href)}})
  const attempts=await Promise.allSettled(Array.from({length:6},()=>new Promise<boolean>((resolve,reject)=>{
    const child=spawn(process.execPath,[bundle,destination],{env:{...process.env,NODE_PATH:path.join(process.cwd(),'node_modules')},stdio:'pipe'})
    let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk)
    child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out).isFirstRun):reject(new Error(err||`exit ${code}`)))
  })))
  for (const attempt of attempts) if(attempt.status==='rejected')throw attempt.reason
  const runs=attempts.map(attempt=>attempt.status==='fulfilled'&&attempt.value)
  expect(runs.filter(Boolean)).toHaveLength(1)
  expect(fs.readFileSync(path.join(destination,'engrams.yaml'),'utf8')).toBe('engrams: []\n')
  const skill=path.join(destination,'packs/datacore-starter-v1/SKILL.md')
  expect(fs.statSync(skill).size).toBeGreaterThan(100)
  fs.writeFileSync(skill,'User customized this pack')
  expect(initCore(destination).isFirstRun).toBe(false)
  expect(fs.readFileSync(skill,'utf8')).toBe('User customized this pack')
},15000)
