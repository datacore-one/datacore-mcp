// src/tools/capture.ts
import * as fs from 'fs'
import * as path from 'path'
import type { StorageConfig } from '../storage.js'

interface CaptureArgs {
  type: 'journal' | 'knowledge'
  content: string
  title?: string
  tags?: string[]
}

interface CaptureResult {
  success: boolean
  path?: string
}

export async function handleCapture(args: CaptureArgs, storage: StorageConfig): Promise<CaptureResult> {
  if (args.type === 'journal') {
    return captureJournal(args.content, storage.journalPath)
  }
  return captureKnowledge(args.content, args.title, args.tags, storage.knowledgePath)
}

function captureJournal(content: string, journalDir: string): CaptureResult {
  const today = new Date().toISOString().split('T')[0]
  const filePath = path.join(journalDir, `${today}.md`)
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8')
    fs.writeFileSync(filePath, `${existing}\n## ${time}\n\n${content}\n`)
  } else {
    fs.writeFileSync(filePath, `# ${today}\n\n## ${time}\n\n${content}\n`)
  }

  return { success: true, path: filePath }
}

function captureKnowledge(content: string, title: string | undefined, tags: string[] | undefined, knowledgeDir: string): CaptureResult {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const slug = (title ?? 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
  const fileName = `${timestamp}-${slug}.md`
  const filePath = path.join(knowledgeDir, fileName)

  const frontmatter = `---\ntitle: "${title ?? 'Untitled'}"\ncreated: "${new Date().toISOString()}"\n---\n\n`
  const tagLine = tags?.length ? `\n${tags.map(t => `#${t}`).join(' ')}\n` : ''
  fs.writeFileSync(filePath, `${frontmatter}${content}\n${tagLine}`)

  return { success: true, path: filePath }
}
