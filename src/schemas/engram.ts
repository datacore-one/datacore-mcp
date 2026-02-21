// src/schemas/engram.ts
import { z } from 'zod'

export const ActivationSchema = z.object({
  retrieval_strength: z.number().min(0).max(1),
  storage_strength: z.number().min(0).max(1),
  frequency: z.number().int().min(0),
  last_accessed: z.string(),
})

export const KnowledgeTypeSchema = z.object({
  memory_class: z.enum(['semantic', 'episodic', 'procedural', 'metacognitive']),
  cognitive_level: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
})

export const RelationsSchema = z.object({
  broader: z.array(z.string()).default([]),
  narrower: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
})

export const ProvenanceSchema = z.object({
  origin: z.string(),
  chain: z.array(z.string()).default([]),
  signature: z.string().nullable().default(null),
  license: z.string().default('cc-by-sa-4.0'),
})

export const FeedbackSignalsSchema = z.object({
  positive: z.number().int().default(0),
  negative: z.number().int().default(0),
  neutral: z.number().int().default(0),
})

export const EngramSchema = z.object({
  id: z.string().regex(/^ENG-[A-Za-z0-9-]+$/),
  version: z.number().int().min(1),
  status: z.enum(['active', 'dormant', 'retired', 'candidate']),
  consolidated: z.boolean().default(false),

  type: z.enum(['behavioral', 'terminological', 'procedural', 'architectural']),
  scope: z.string(),
  visibility: z.enum(['private', 'public', 'template']).default('private'),
  statement: z.string().min(1),
  rationale: z.string().optional(),
  contraindications: z.array(z.string()).optional(),
  source_patterns: z.array(z.string()).optional(),
  derivation_count: z.number().int().min(0).default(1),

  knowledge_type: KnowledgeTypeSchema.optional(),
  domain: z.string().optional(),
  relations: RelationsSchema.optional(),
  activation: ActivationSchema,
  provenance: ProvenanceSchema.optional(),
  feedback_signals: FeedbackSignalsSchema.optional(),
  tags: z.array(z.string()).default([]),
  pack: z.string().nullable().default(null),
  abstract: z.string().nullable().default(null),
  derived_from: z.string().nullable().default(null),
})

export type Engram = z.infer<typeof EngramSchema>

// Pack manifest matches SKILL.md frontmatter structure
export const DatacoreExtensionSchema = z.object({
  id: z.string(),
  injection_policy: z.enum(['on_match', 'on_request']),
  match_terms: z.array(z.string()).default([]),
  domain: z.string().optional(),
  engram_count: z.number().int().min(0),
})

export const PackManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  creator: z.string().optional(),
  license: z.string().optional(),
  tags: z.array(z.string()).default([]),
  'x-datacore': DatacoreExtensionSchema,
})

export type PackManifest = z.infer<typeof PackManifestSchema>
