// src/tools/capture.ts
import * as fs from 'fs'
import * as path from 'path'
import type { StorageConfig } from '../storage.js'
import { validateContent, validateTitle } from '../limits.js'

interface CaptureArgs {
  type: 'journal' | 'knowledge'
  content: string
  title?: string
  tags?: string[]
}

interface CaptureResult {
  success: boolean
  path?: string
  error?: string
}

export async function handleCapture(args: CaptureArgs, storage: StorageConfig): Promise<CaptureResult> {
  const contentError = validateContent(args.content)
  if (contentError) return { success: false, error: contentError }
  if (args.title) {
    const titleError = validateTitle(args.title)
    if (titleError) return { success: false, error: titleError }
  }
  if (args.type === 'journal') {
    return captureJournal(args.content, storage.journalPath)
  }
  return captureKnowledge(args.content, args.title, args.tags, storage.knowledgePath)
}

export function localDate(tz?: string): { date: string; time: string } {
  const timezone = tz || process.env.DATACORE_TIMEZONE || undefined
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }) // en-CA gives YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone })
  return { date: dateStr, time: timeStr }
}

function captureJournal(content: string, journalDir: string): CaptureResult {
  const { date: today, time } = localDate()
  const filePath = path.join(journalDir, `${today}.md`)

  fs.mkdirSync(path.dirname(filePath), { recursive: true })

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

  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  const frontmatter = `---\ntitle: "${title ?? 'Untitled'}"\ncreated: "${new Date().toISOString()}"\n---\n\n`
  const tagLine = tags?.length ? `\n${tags.map(t => `#${t}`).join(' ')}\n` : ''
  fs.writeFileSync(filePath, `${frontmatter}${content}\n${tagLine}`)

  return { success: true, path: filePath }
}
