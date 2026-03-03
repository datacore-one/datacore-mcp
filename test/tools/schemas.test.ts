import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { handleSchemas } from '../../src/tools/schemas.js'
import type { SchemaDefinition } from '../../src/schemas/schema-definition.js'

let tmpDir: string
let schemasPath: string
let engramsPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schemas-test-'))
  schemasPath = path.join(tmpDir, 'schemas.yaml')
  engramsPath = path.join(tmpDir, 'engrams.yaml')
  fs.writeFileSync(engramsPath, 'engrams: []\n')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeSchemas(schemas: SchemaDefinition[]) {
  fs.writeFileSync(schemasPath, yaml.dump({ schemas }, { lineWidth: 120 }))
}

const sampleSchema: SchemaDefinition = {
  id: 'SCH-2026-0301-001',
  name: 'Test Schema',
  members: ['ENG-2026-0301-001', 'ENG-2026-0301-002', 'ENG-2026-0301-003'],
  confidence: 0.7,
  status: 'candidate',
  shared_anchors: ['a.md', 'b.md'],
  created: '2026-03-01',
  updated: '2026-03-01',
}

describe('handleSchemas', () => {
  it('list returns empty when no schemas file', async () => {
    const result = await handleSchemas(
      { action: 'list' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.total).toBe(0)
    expect(result.schemas).toEqual([])
  })

  it('list returns schemas with summary fields', async () => {
    writeSchemas([sampleSchema])
    const result = await handleSchemas(
      { action: 'list' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.total).toBe(1)
    expect(result.schemas[0].id).toBe('SCH-2026-0301-001')
    expect(result.schemas[0].members).toBe(3)
  })

  it('activate changes status to active', async () => {
    writeSchemas([sampleSchema])
    const result = await handleSchemas(
      { action: 'activate', id: 'SCH-2026-0301-001' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.status).toBe('active')

    const raw = yaml.load(fs.readFileSync(schemasPath, 'utf8')) as any
    expect(raw.schemas[0].status).toBe('active')
  })

  it('archive changes status to archived', async () => {
    writeSchemas([{ ...sampleSchema, status: 'active' }])
    const result = await handleSchemas(
      { action: 'archive', id: 'SCH-2026-0301-001' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.status).toBe('archived')
  })

  it('merge combines two schemas', async () => {
    const schema2: SchemaDefinition = {
      ...sampleSchema,
      id: 'SCH-2026-0301-002',
      name: 'Second',
      members: ['ENG-2026-0301-004', 'ENG-2026-0301-005'],
      shared_anchors: ['c.md'],
    }
    writeSchemas([sampleSchema, schema2])
    const result = await handleSchemas(
      { action: 'merge', id: 'SCH-2026-0301-002', target_id: 'SCH-2026-0301-001' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.merged_into).toBe('SCH-2026-0301-001')
    expect(result.archived).toBe('SCH-2026-0301-002')
    expect(result.members).toBe(5) // 3 + 2
  })

  it('split extracts members into new schema', async () => {
    writeSchemas([sampleSchema])
    const result = await handleSchemas(
      { action: 'split', id: 'SCH-2026-0301-001', member_ids: ['ENG-2026-0301-003'], name: 'New Split' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.original.remaining_members).toBe(2)
    expect(result.new_schema.members).toBe(1)
  })

  it('detect runs detection on engrams', async () => {
    // Empty engrams = no schemas detected
    const result = await handleSchemas(
      { action: 'detect' },
      { schemasPath, engramsPath },
    ) as any
    expect(result.created).toBe(0)
  })

  it('migrate previews by default, executes with confirm', async () => {
    const engrams = [{
      id: 'ENG-2026-0301-001',
      version: 2,
      status: 'active',
      consolidated: false,
      type: 'behavioral',
      scope: 'global',
      visibility: 'private',
      statement: 'Test',
      derivation_count: 1,
      knowledge_anchors: [],
      associations: [],
      tags: [],
      activation: { retrieval_strength: 0.7, storage_strength: 1.0, frequency: 0, last_accessed: '2026-03-01' },
      pack: null,
      abstract: null,
      derived_from: null,
      relations: {
        broader: ['ENG-2026-0301-002'],
        narrower: [],
        related: ['ENG-2026-0301-003'],
        conflicts: [],
      },
    }]
    fs.writeFileSync(engramsPath, yaml.dump({ engrams }, { lineWidth: 120 }))

    // Preview
    const preview = await handleSchemas(
      { action: 'migrate' },
      { schemasPath, engramsPath },
    ) as any
    expect(preview.action).toBe('preview')
    expect(preview.engrams_with_relations).toBe(1)
    expect(preview.associations_created).toBe(2) // broader + related

    // Execute
    const exec = await handleSchemas(
      { action: 'migrate', confirm: true },
      { schemasPath, engramsPath },
    ) as any
    expect(exec.action).toBe('executed')

    // Verify file
    const raw = yaml.load(fs.readFileSync(engramsPath, 'utf8')) as any
    expect(raw.engrams[0].associations).toHaveLength(2)
    expect(raw.engrams[0].relations).toBeUndefined()
  })
})
