// src/engagement/types.ts
import { z } from 'zod'

// === Profile schemas ===

export const IdentitySchema = z.object({
  mode: z.enum(['private', 'anonymous', 'verified']).default('private'),
  pseudonym: z.string().nullable().default(null),
  erc8004_address: z.string().nullable().default(null),
  erc8004_registered: z.boolean().default(false),
})

export const XPHistoryEntrySchema = z.object({
  date: z.string(),
  earned: z.number(),
  base_earned: z.number(),
  multiplier: z.number(),
  actions: z.array(z.string()),
})

export const TierHistoryEntrySchema = z.object({
  tier: z.string(),
  date: z.string(),
})

export const MultiplierEntrySchema = z.object({
  type: z.string(),
  factor: z.number(),
  since: z.string(),
})

export const ChallengeSchema = z.object({
  id: z.string(),
  type: z.string(),
  tier: z.string(),
  description: z.string(),
  criteria: z.object({
    metric: z.string(),
    target_delta: z.number(),
  }),
  baseline_stats: z.record(z.number()),
  bonus_xp: z.number(),
  started_at: z.string(),
  expires_at: z.string(),
})

export const ChallengeHistorySchema = z.object({
  type: z.string(),
  tier: z.string(),
  completed: z.boolean(),
  date: z.string(),
})

export const ReconsolidationPendingSchema = z.object({
  engram_id: z.string(),
  contradicting_id: z.string(),
  statement: z.string(),
  contradiction: z.string(),
  evidence_strength: z.enum(['weak', 'moderate', 'strong']),
  confidence: z.number(),
  detected_at: z.string(),
  expires_at: z.string(),
})

export const DiscoverySchema = z.object({
  id: z.string(),
  engram_a: z.object({ id: z.string(), domain: z.string(), statement: z.string() }),
  engram_b: z.object({ id: z.string(), domain: z.string(), statement: z.string() }),
  connection: z.string(),
  offered_at: z.string(),
})

export const EngagementProfileSchema = z.object({
  version: z.literal(4),
  identity: IdentitySchema.default({}),
  xp: z.object({
    total: z.number().default(0),
    this_week: z.number().default(0),
    history: z.array(XPHistoryEntrySchema).default([]),
  }).default({}),
  tier: z.object({
    current: z.string().default('Seed'),
    achieved_at: z.string().nullable().default(null),
    history: z.array(TierHistoryEntrySchema).default([]),
  }).default({}),
  multipliers: z.object({
    active: z.array(MultiplierEntrySchema).default([]),
    effective: z.number().default(1.0),
  }).default({}),
  consistency: z.object({
    active_days_30: z.number().default(0),
    best_run: z.number().default(0),
    last_active: z.string().nullable().default(null),
  }).default({}),
  challenges: z.object({
    active: ChallengeSchema.nullable().default(null),
    completed: z.number().default(0),
    dismissed: z.number().default(0),
    graduated: z.boolean().default(false),
    history: z.array(ChallengeHistorySchema).default([]),
  }).default({}),
  reconsolidation: z.object({
    pending: z.array(ReconsolidationPendingSchema).default([]),
    total_resolved: z.number().default(0),
    outcomes: z.object({
      defended: z.number().default(0),
      revised: z.number().default(0),
      retired: z.number().default(0),
      dismissed: z.number().default(0),
    }).default({}),
    response_rate: z.number().default(0),
  }).default({}),
  discoveries: z.object({
    pending: z.array(DiscoverySchema).default([]),
    total: z.number().default(0),
    last_offered: z.string().nullable().default(null),
    explored: z.number().default(0),
    noted: z.number().default(0),
    explore_rate: z.number().default(0),
  }).default({}),
  ai_performance: z.object({
    total_injections: z.number().default(0),
    feedback_count: z.number().default(0),
    helpful_ratio: z.number().default(0),
    top_engrams: z.array(z.object({
      id: z.string(),
      injections: z.number(),
      positive_ratio: z.number(),
    })).default([]),
    unused_60d: z.array(z.string()).default([]),
  }).default({}),
  reputation: z.object({
    score: z.number().default(0),
    components: z.object({
      feedback_ratio: z.number().default(0),
      stake_amount: z.number().default(0),
      tenure_days: z.number().default(0),
      reconsolidation_honesty: z.number().default(0),
    }).default({}),
    last_calculated: z.string().nullable().default(null),
  }).default({}),
  leaderboard: z.object({
    mode: z.enum(['private', 'anonymous', 'verified']).default('private'),
    display_name: z.string().nullable().default(null),
    position: z.number().nullable().default(null),
  }).default({}),
  badge: z.object({
    preview_svg: z.string().nullable().default(null),
    nft_token_id: z.string().nullable().default(null),
    last_generated: z.string().nullable().default(null),
  }).default({}),
  stats: z.object({
    total_engrams_created: z.number().default(0),
    total_feedback_given: z.number().default(0),
    total_engrams_retired: z.number().default(0),
    total_packs_exported: z.number().default(0),
    total_feedback_received: z.number().default(0),
    feedback_positive_ratio: z.number().default(0),
    domains_covered: z.number().default(0),
    public_engrams: z.number().default(0),
    first_activity: z.string().nullable().default(null),
  }).default({}),
})

// === Event schemas ===

export const XPEventSchema = z.object({
  action_key: z.string(),
  xp_base: z.number(),
  multiplier: z.number(),
  xp_earned: z.number(),
  timestamp: z.string(),
  context: z.record(z.unknown()).optional(),
})

export const XPResultSchema = z.object({
  event: XPEventSchema,
  tier_change: z.object({
    from: z.string(),
    to: z.string(),
    message: z.string(),
  }).nullable(),
})

// === Action registry schema ===

export const XPActionSchema = z.object({
  xp: z.number(),
  trigger: z.string(),
  condition: z.string().optional(),
  daily_limit: z.number().optional(),
  cooldown_days: z.number().optional(),
  reciprocity_cap: z.number().optional(),
  description: z.string(),
})

export const XPActionRegistrySchema = z.object({
  version: z.number(),
  actions: z.record(XPActionSchema),
})

// === Inferred types ===

export type Identity = z.infer<typeof IdentitySchema>
export type XPHistoryEntry = z.infer<typeof XPHistoryEntrySchema>
export type TierHistoryEntry = z.infer<typeof TierHistoryEntrySchema>
export type MultiplierEntry = z.infer<typeof MultiplierEntrySchema>
export type Challenge = z.infer<typeof ChallengeSchema>
export type ChallengeHistory = z.infer<typeof ChallengeHistorySchema>
export type ReconsolidationPending = z.infer<typeof ReconsolidationPendingSchema>
export type Discovery = z.infer<typeof DiscoverySchema>
export type EngagementProfile = z.infer<typeof EngagementProfileSchema>
export type XPEvent = z.infer<typeof XPEventSchema>
export type XPResult = z.infer<typeof XPResultSchema>
export type XPAction = z.infer<typeof XPActionSchema>
export type XPActionRegistry = z.infer<typeof XPActionRegistrySchema>

// === Tier thresholds ===

export const TIER_THRESHOLDS: Array<{ name: string; minXP: number }> = [
  { name: 'Seed', minXP: 0 },
  { name: 'Cipher', minXP: 100 },
  { name: 'Sage', minXP: 500 },
  { name: 'Adept', minXP: 1200 },
  { name: 'Visionary', minXP: 2500 },
  { name: 'Oracle', minXP: 5000 },
]

// === Engagement config type ===

export interface EngagementConfig {
  enabled: boolean
  inline_xp: boolean
}
