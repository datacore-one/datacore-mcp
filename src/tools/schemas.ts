// src/tools/schemas.ts
import * as fs from 'fs'
import { loadSchemas, saveSchemas, generateSchemaId, type SchemaDefinition } from '../schemas/schema-definition.js'
import { loadEngrams } from '../engrams.js'
import { detectSchemas } from '../schema-detection.js'
import { flattenRelations } from '../inject.js'
import { atomicWriteYaml } from './inject-tool.js'
import { buildHints } from '../hints.js'

interface SchemasArgs {
  action: 'list' | 'detect' | 'activate' | 'archive' | 'merge' | 'split' | 'migrate'
  id?: string
  target_id?: string
  member_ids?: string[]
  name?: string
  confirm?: boolean
}

export async function handleSchemas(
  args: SchemasArgs,
  paths: { schemasPath: string; engramsPath: string },
): Promise<unknown> {
  switch (args.action) {
    case 'list': return listSchemas(paths.schemasPath)
    case 'detect': return detectAction(paths)
    case 'activate': return setStatus(paths.schemasPath, args.id!, 'active')
    case 'archive': return setStatus(paths.schemasPath, args.id!, 'archived')
    case 'merge': return mergeSchemas(paths.schemasPath, args.id!, args.target_id!)
    case 'split': return splitSchema(paths.schemasPath, args.id!, args.member_ids!, args.name)
    case 'migrate': return migrateRelations(paths.engramsPath, args.confirm)
    default: throw new Error(`Unknown schemas action: ${args.action}`)
  }
}

function listSchemas(schemasPath: string) {
  const schemas = loadSchemas(schemasPath)
  return {
    schemas: schemas.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      members: s.members.length,
      confidence: s.confidence,
      shared_anchors: s.shared_anchors.length,
      updated: s.updated,
    })),
    total: schemas.length,
    _hints: buildHints({
      next: schemas.length === 0
        ? 'No schemas yet. Use action="detect" to discover schemas from association graph.'
        : 'Use action="detect" to update schemas from current associations.',
      related: ['datacore.schemas'],
    }),
  }
}

function detectAction(paths: { schemasPath: string; engramsPath: string }) {
  const engrams = loadEngrams(paths.engramsPath)
  const existing = loadSchemas(paths.schemasPath)
  const result = detectSchemas(engrams, existing)

  if (result.warning) {
    return { warning: result.warning, created: 0, updated: 0, flagged: 0 }
  }

  // Merge results with existing schemas
  const updatedIds = new Set(result.updated.map(s => s.id))
  const final = [
    ...existing.filter(s => !updatedIds.has(s.id)),
    ...result.updated,
    ...result.created,
  ]

  // Ensure directory exists
  const dir = paths.schemasPath.substring(0, paths.schemasPath.lastIndexOf('/'))
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  saveSchemas(paths.schemasPath, final)

  return {
    created: result.created.length,
    updated: result.updated.length,
    flagged: result.flagged.length,
    flagged_ids: result.flagged.map(s => s.id),
    total: final.length,
    _hints: buildHints({
      next: result.created.length > 0
        ? `${result.created.length} new candidate schema(s) found. Use action="activate" to promote.`
        : 'Schema detection complete.',
      related: ['datacore.schemas'],
    }),
  }
}

function setStatus(schemasPath: string, id: string, newStatus: SchemaDefinition['status']) {
  const schemas = loadSchemas(schemasPath)
  const schema = schemas.find(s => s.id === id)
  if (!schema) throw new Error(`Schema not found: ${id}`)

  schema.status = newStatus
  schema.updated = new Date().toISOString().split('T')[0]
  saveSchemas(schemasPath, schemas)

  return {
    id: schema.id,
    status: newStatus,
    _hints: buildHints({ next: `Schema ${id} is now ${newStatus}.`, related: ['datacore.schemas'] }),
  }
}

function mergeSchemas(schemasPath: string, sourceId: string, targetId: string) {
  const schemas = loadSchemas(schemasPath)
  const source = schemas.find(s => s.id === sourceId)
  const target = schemas.find(s => s.id === targetId)
  if (!source) throw new Error(`Source schema not found: ${sourceId}`)
  if (!target) throw new Error(`Target schema not found: ${targetId}`)

  // Union members, recalc confidence
  const memberSet = new Set([...target.members, ...source.members])
  target.members = Array.from(memberSet).sort()
  const anchorSet = new Set([...target.shared_anchors, ...source.shared_anchors])
  target.shared_anchors = Array.from(anchorSet)
  target.confidence = Math.max(target.confidence, source.confidence)
  // Keep higher status
  const statusOrder = { archived: 0, candidate: 1, active: 2, consolidated: 3 }
  if (statusOrder[source.status] > statusOrder[target.status]) {
    target.status = source.status
  }
  target.updated = new Date().toISOString().split('T')[0]

  // Archive source
  source.status = 'archived'
  source.updated = target.updated

  saveSchemas(schemasPath, schemas)

  return {
    merged_into: target.id,
    archived: source.id,
    members: target.members.length,
    _hints: buildHints({ next: `Merged ${sourceId} into ${targetId}.`, related: ['datacore.schemas'] }),
  }
}

function splitSchema(schemasPath: string, id: string, memberIds: string[], name?: string) {
  const schemas = loadSchemas(schemasPath)
  const schema = schemas.find(s => s.id === id)
  if (!schema) throw new Error(`Schema not found: ${id}`)

  // Verify members belong to schema
  const schemaMembers = new Set(schema.members)
  for (const memberId of memberIds) {
    if (!schemaMembers.has(memberId)) throw new Error(`${memberId} is not a member of ${id}`)
  }

  // Remove from original
  schema.members = schema.members.filter(m => !memberIds.includes(m))
  schema.updated = new Date().toISOString().split('T')[0]

  // Create new schema
  const newSchema: SchemaDefinition = {
    id: generateSchemaId(schemas),
    name: name ?? `Split from ${schema.name}`,
    members: memberIds.sort(),
    confidence: schema.confidence * 0.8,
    status: 'candidate',
    shared_anchors: [],
    created: schema.updated,
    updated: schema.updated,
  }
  schemas.push(newSchema)
  saveSchemas(schemasPath, schemas)

  return {
    original: { id: schema.id, remaining_members: schema.members.length },
    new_schema: { id: newSchema.id, members: newSchema.members.length },
    _hints: buildHints({ next: `Split complete. New schema: ${newSchema.id}`, related: ['datacore.schemas'] }),
  }
}

function migrateRelations(engramsPath: string, confirm?: boolean) {
  const engrams = loadEngrams(engramsPath)
  let migratedCount = 0
  let totalAssociations = 0

  for (const engram of engrams) {
    if (engram.pack) continue // skip pack engrams
    if (!engram.relations) continue
    const converted = flattenRelations(engram)
    if (converted.length === 0) continue

    if (confirm) {
      // Add converted associations (avoid duplicates)
      const existingTargets = new Set(engram.associations.map(a => `${a.target}:${a.type}`))
      for (const assoc of converted) {
        const key = `${assoc.target}:${assoc.type}`
        if (!existingTargets.has(key)) {
          engram.associations.push(assoc)
          totalAssociations++
        }
      }
      // Clear relations field
      delete (engram as any).relations
      migratedCount++
    } else {
      migratedCount++
      totalAssociations += converted.length
    }
  }

  if (confirm && migratedCount > 0) {
    atomicWriteYaml(engramsPath, { engrams })
  }

  return {
    action: confirm ? 'executed' : 'preview',
    engrams_with_relations: migratedCount,
    associations_created: totalAssociations,
    _hints: buildHints({
      next: confirm
        ? `Migrated ${migratedCount} engram(s) from relations to associations.`
        : `Preview: ${migratedCount} engram(s) to migrate. Set confirm=true to execute.`,
      related: ['datacore.schemas'],
    }),
  }
}
