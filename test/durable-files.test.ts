import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { buildSync } from 'esbuild'
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }))
import { appendJournal, createText } from '../src/durable-files.js'

let root: string
beforeEach(() => { root=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-durable-files-')) })
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root,{recursive:true,force:true}) })

describe('durable file publication', () => {
 it('cannot overwrite a destination that already exists', () => {
   const dest=path.join(root,'existing.md'); fs.writeFileSync(dest,'Keep exact bytes\r\n')
   expect(createText(root,dest,'Replacement')).toBe(false)
   expect(fs.readFileSync(dest,'utf8')).toBe('Keep exact bytes\r\n')
 })
 it('does not publish a failed temporary write', () => {
   const dest=path.join(root,'new.md')
   vi.spyOn(fs,'fsyncSync').mockImplementationOnce(()=>{throw new Error('Synthetic disk failure')})
   expect(()=>createText(root,dest,'Synthetic')).toThrow()
   expect(fs.existsSync(dest)).toBe(false)
 })
 it('publishes complete private bytes and syncs before success', () => {
   const sync=vi.spyOn(fs,'fsyncSync')
   const dest=path.join(root,'new.md')
   expect(createText(root,dest,'Complete bytes\r\n')).toBe(true)
   expect(fs.readFileSync(dest,'utf8')).toBe('Complete bytes\r\n')
   expect(fs.statSync(dest).mode & 0o777).toBe(0o600)
   expect(sync).toHaveBeenCalled()
 })
 it.each(['symlink','hardlink'])('refuses a journal %s without altering its target', kind => {
   const dest=path.join(root,'journal.md'), target=path.join(root,'target.md')
   fs.writeFileSync(target,'Preserve')
   if(kind==='symlink') fs.symlinkSync(target,dest); else fs.linkSync(target,dest)
   expect(()=>appendJournal(root,path.join(root,'state'),dest,'Header','New')).toThrow()
   expect(fs.readFileSync(target,'utf8')).toBe('Preserve')
 })
 it('refuses a symlinked directory and out-of-store destination', () => {
   const outside=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-other-store-'))
   try {
     fs.symlinkSync(outside,path.join(root,'alias'))
     expect(()=>createText(root,path.join(root,'alias','new.md'),'New')).toThrow()
     expect(()=>createText(root,path.join(outside,'new.md'),'New')).toThrow()
     expect(fs.readdirSync(outside)).toEqual([])
   } finally {fs.rmSync(outside,{recursive:true,force:true})}
 })
 it('short append preserves all prior bytes and a subsequent append recovers', () => {
   const dest=path.join(root,'journal.md'); fs.writeFileSync(dest,'Prior bytes\r\n')
   const write=fs.writeSync
   vi.spyOn(fs,'writeSync').mockImplementationOnce(((fd:number, bytes:Buffer)=>write(fd,bytes.subarray(0,4))) as any)
   expect(()=>appendJournal(root,path.join(root,'state'),dest,'Header','\n## Incomplete\n')).toThrow()
   expect(fs.readFileSync(dest,'utf8')).toBe('Prior bytes\r\n\n## ')
   appendJournal(root,path.join(root,'state'),dest,'Header','\n## Complete\n')
   expect(fs.readFileSync(dest,'utf8')).toBe('Prior bytes\r\n\n## \n## Complete\n')
 })
 it('serializes independent writers and recovers after process death', async () => {
   const bundle=path.join(root,'writer.cjs')
   buildSync({stdin:{contents:`import {appendJournal} from './src/durable-files.ts'; appendJournal(process.argv[2],process.argv[2]+'/state',process.argv[2]+'/journal.md','# Journal\\n','\\n## '+process.argv[3]+'\\n');`,resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['better-sqlite3']})
   const env={...process.env,NODE_PATH:path.join(process.cwd(),'node_modules')}
   async function run(id:string) {
     await new Promise<void>((resolve,reject)=>{
       const child=spawn(process.execPath,[bundle,root,id],{env,stdio:'pipe'})
       let diagnostic='';child.stderr.on('data',chunk=>{diagnostic+=chunk})
       child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(diagnostic||`exit ${code}`)))
     })
   }
   await Promise.all(Array.from({length:8},(_,i)=>run('writer-'+i)))
   const text=fs.readFileSync(path.join(root,'journal.md'),'utf8')
   expect(text.match(/# Journal/g)?.length).toBe(1)
   for(let i=0;i<8;i++)expect(text.match(new RegExp('## writer-'+i+'\\n','g'))?.length).toBe(1)
   // Hold the actual coordinator from another process, then kill it without
   // cleanup. SQLite releases ownership; no stale lock file needs deletion.
   const holder=spawn(process.execPath,['-e',`const Database=require('better-sqlite3');const db=new Database(process.argv[1]);db.exec('BEGIN IMMEDIATE');process.stdout.write('ready');setInterval(()=>{},1000)`,path.join(root,'state/mcp-file-writes/coordination.db')],{env,stdio:'pipe'})
   await new Promise<void>((resolve,reject)=>{holder.stdout.once('data',()=>resolve());holder.once('error',reject);holder.once('exit',()=>reject(new Error('holder exited before readiness')))})
   const exited=new Promise<void>(resolve=>holder.once('exit',()=>resolve()));holder.kill('SIGKILL');await exited
   await run('after-crash')
   expect(fs.readFileSync(path.join(root,'journal.md'),'utf8')).toBe(text+'\n## after-crash\n')
 },15000)
})
