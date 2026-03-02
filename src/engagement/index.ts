// src/engagement/index.ts — barrel export
export { EngagementService } from './service.js'
export {
  EngagementProfileSchema,
  XPEventSchema,
  XPResultSchema,
  XPActionSchema,
  XPActionRegistrySchema,
  ChallengeSchema,
  DiscoverySchema,
  ReconsolidationPendingSchema,
  IdentitySchema,
  MultiplierEntrySchema,
  TIER_THRESHOLDS,
} from './types.js'
export type {
  EngagementProfile,
  EngagementConfig,
  XPEvent,
  XPResult,
  XPAction,
  XPActionRegistry,
  Challenge,
  Discovery,
  ReconsolidationPending,
  Identity,
  MultiplierEntry,
} from './types.js'
export { detectContradiction, queueReconsolidation, resolveReconsolidation, expireReconsolidations } from './reconsolidation.js'
export { generateDiscoveryCandidates, evaluateDiscovery, offerDiscovery, resolveDiscovery } from './discovery.js'
export { generateChallenge, checkChallengeCompletion, resolveChallenge, dismissChallenge } from './challenges.js'
export { formatSessionStart, formatSessionEnd, formatStatus, formatTierUp, formatReconsolidation, formatDiscovery, formatChallenge, formatGettingStartedGraduation } from './format.js'
export { calculateReputation, updateReputation } from './reputation.js'
export { getLeaderboard } from './leaderboard.js'
export { generateBadgeSVG } from './badge.js'
