import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { handleCapture } from '../../src/tools/capture.js'
import { handleIngest } from '../../src/tools/ingest.js'

let root: string
let storage: any
beforeEach(() => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'datacore-write-preservation-'))
  storage={mode:'core',basePath:root,journalPath:path.join(root,'journal'),knowledgePath:path.join(root,'knowledge'),statePath:path.join(root,'state')}
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T12:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); fs.rmSync(root,{recursive:true,force:true}) })

describe('acknowledged notes cannot overwrite valid content', () => {
  it.each(['capture','ingest'])('%s retains distinct same-title notes within one second', async kind => {
    const results=[]
    for (const content of ['First unique content','Second unique content']) {
      const result = kind==='capture' ? await handleCapture({type:'knowledge',title:'Same title',content},storage)
        : await handleIngest({title:'Same title',content},storage)
      expect(result.success).toBe(true)
      results.push('note_path' in result ? result.note_path : (result as any).path)
    }
    expect(new Set(results).size).toBe(2)
    expect(fs.readFileSync(results[0]!,'utf8')).toContain('First unique content')
    expect(fs.readFileSync(results[1]!,'utf8')).toContain('Second unique content')
  })
  it.each(['capture','ingest'].flatMap(kind => [
    'Quoted "title" with : value and \\ path', 'Line\nbreak', 'Unicode\u0085next\u2028line\u2029paragraph',
  ].map(title => ({kind,title}))))('$kind round-trips unusual valid titles in metadata: $title', async ({kind,title}) => {
    const result = kind==='capture' ? await handleCapture({type:'knowledge',title,content:'Synthetic'},storage)
      : await handleIngest({title,content:'Synthetic'},storage)
    expect(result.success).toBe(true)
    const filename='note_path' in result ? result.note_path : (result as any).path
    const text=fs.readFileSync(filename!,'utf8')
    expect((yaml.load(text.split('---')[1]) as any).title).toBe(title)
  })
})
