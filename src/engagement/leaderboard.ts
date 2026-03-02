// src/engagement/leaderboard.ts
import type { EngagementProfile } from './types.js'

interface LeaderboardEntry {
  display_name: string
  tier: string
  xp: number
  reputation: number
  position: number
}

interface LeaderboardResult {
  mode: 'solo' | 'network'
  entries: LeaderboardEntry[]
  your_position: number | null
}

export function getLeaderboard(profile: EngagementProfile): LeaderboardResult {
  if (profile.leaderboard.mode === 'private') {
    // Solo mode: personal dashboard only
    return {
      mode: 'solo',
      entries: [{
        display_name: 'You',
        tier: profile.tier.current,
        xp: profile.xp.total,
        reputation: profile.reputation.score,
        position: 1,
      }],
      your_position: 1,
    }
  }

  // Network mode: placeholder stub for future implementation
  return {
    mode: 'network',
    entries: [{
      display_name: profile.identity.pseudonym ?? profile.identity.erc8004_address ?? 'Anonymous',
      tier: profile.tier.current,
      xp: profile.xp.total,
      reputation: profile.reputation.score,
      position: profile.leaderboard.position ?? 1,
    }],
    your_position: profile.leaderboard.position,
  }
}
