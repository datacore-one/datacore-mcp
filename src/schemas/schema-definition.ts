// src/schemas/schema-definition.ts
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { z } from 'zod'

export const SchemaDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  status: z.enum(['candidate', 'active', 'consolidated', 'archived']),
  shared_anchors: z.array(z.string()),
  created: z.string(),
  updated: z.string(),
})

export type SchemaDefinition = z.infer<typeof SchemaDefinitionSchema>

export function loadSchemas(filePath: string): SchemaDefinition[] {
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf8')) as any
    if (!raw?.schemas || !Array.isArray(raw.schemas)) return []
    const valid: SchemaDefinition[] = []
    for (const entry of raw.schemas) {
      const result = SchemaDefinitionSchema.safeParse(entry)
      if (result.success) valid.push(result.data)
    }
    return valid
  } catch {
    return []
  }
}

export function saveSchemas(filePath: string, schemas: SchemaDefinition[]): void {
  const content = yaml.dump({ schemas }, { lineWidth: 120, noRefs: true, quotingType: '"' })
  const tmpPath = filePath + '.tmp.' + process.pid
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, filePath)
}

export function generateSchemaId(existing: SchemaDefinition[]): string {
  const now = new Date()
  const date = now.toISOString().split('T')[0].replace(/-/g, '').slice(0, 8)
  const prefix = `SCH-${date.slice(0, 4)}-${date.slice(4)}-`

  let maxSeq = 0
  for (const s of existing) {
    if (s.id.startsWith(prefix)) {
      const seq = parseInt(s.id.slice(prefix.length), 10)
      if (seq > maxSeq) maxSeq = seq
    }
  }

  const nextSeq = maxSeq + 1
  const padWidth = nextSeq > 999 ? String(nextSeq).length : 3
  return `${prefix}${String(nextSeq).padStart(padWidth, '0')}`
}
