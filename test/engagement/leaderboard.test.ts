// test/engagement/leaderboard.test.ts
import { describe, it, expect } from 'vitest'
import { getLeaderboard } from '../../src/engagement/leaderboard.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'

describe('getLeaderboard', () => {
  it('solo mode (private) returns single entry with display_name "You"', () => {
    const profile = createDefaultProfile()
    profile.leaderboard.mode = 'private'
    profile.xp.total = 42
    profile.tier.current = 'Cipher'
    profile.reputation.score = 0.5

    const result = getLeaderboard(profile)
    expect(result.mode).toBe('solo')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toEqual({
      display_name: 'You',
      tier: 'Cipher',
      xp: 42,
      reputation: 0.5,
      position: 1,
    })
    expect(result.your_position).toBe(1)
  })

  it('network mode returns entry with pseudonym', () => {
    const profile = createDefaultProfile()
    profile.leaderboard.mode = 'anonymous'
    profile.identity.pseudonym = 'cipher-abcd'
    profile.xp.total = 100
    profile.tier.current = 'Sage'
    profile.reputation.score = 0.75
    profile.leaderboard.position = 3

    const result = getLeaderboard(profile)
    expect(result.mode).toBe('network')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].display_name).toBe('cipher-abcd')
    expect(result.entries[0].tier).toBe('Sage')
    expect(result.entries[0].xp).toBe(100)
    expect(result.entries[0].reputation).toBe(0.75)
    expect(result.entries[0].position).toBe(3)
    expect(result.your_position).toBe(3)
  })

  it('network mode returns entry with erc8004_address when no pseudonym', () => {
    const profile = createDefaultProfile()
    profile.leaderboard.mode = 'verified'
    profile.identity.erc8004_address = '0x1234abcd'
    profile.identity.pseudonym = null
    profile.xp.total = 200
    profile.leaderboard.position = 1

    const result = getLeaderboard(profile)
    expect(result.mode).toBe('network')
    expect(result.entries[0].display_name).toBe('0x1234abcd')
  })

  it('network mode falls back to "Anonymous" when no pseudonym or address', () => {
    const profile = createDefaultProfile()
    profile.leaderboard.mode = 'anonymous'
    profile.identity.pseudonym = null
    profile.identity.erc8004_address = null

    const result = getLeaderboard(profile)
    expect(result.mode).toBe('network')
    expect(result.entries[0].display_name).toBe('Anonymous')
  })
})
