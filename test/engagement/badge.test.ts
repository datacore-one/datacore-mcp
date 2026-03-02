// test/engagement/badge.test.ts
import { describe, it, expect } from 'vitest'
import { generateBadgeSVG } from '../../src/engagement/badge.js'
import { createDefaultProfile } from '../../src/engagement/profile.js'
import type { EngagementProfile } from '../../src/engagement/types.js'

function profileWithTier(tier: string, domains = 0): EngagementProfile {
  const profile = createDefaultProfile()
  profile.tier.current = tier
  profile.stats.domains_covered = domains
  return profile
}

describe('generateBadgeSVG', () => {
  it('returns a valid SVG string (contains <svg and </svg>)', () => {
    const profile = createDefaultProfile()
    const svg = generateBadgeSVG(profile)
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
  })

  it('is deterministic (same profile produces same SVG)', () => {
    const profile = createDefaultProfile()
    profile.stats.domains_covered = 3
    profile.reputation.score = 0.5

    const svg1 = generateBadgeSVG(profile)
    const svg2 = generateBadgeSVG(profile)
    expect(svg1).toBe(svg2)
  })

  it('produces different shapes for different tiers', () => {
    const tiers = ['Seed', 'Cipher', 'Sage', 'Adept', 'Visionary', 'Oracle']
    const svgs = tiers.map(tier => generateBadgeSVG(profileWithTier(tier)))

    // Each tier should produce a unique SVG (different shapes)
    const unique = new Set(svgs)
    expect(unique.size).toBe(tiers.length)
  })

  it('varies facet lines count based on domains', () => {
    const svg0 = generateBadgeSVG(profileWithTier('Seed', 0))
    const svg5 = generateBadgeSVG(profileWithTier('Seed', 5))

    // 0 domains = 0 facet lines, 5 domains = 5 <line> elements
    const lineCount0 = (svg0.match(/<line /g) || []).length
    const lineCount5 = (svg5.match(/<line /g) || []).length

    expect(lineCount0).toBe(0)
    expect(lineCount5).toBe(5)
  })

  it('contains tier name as text', () => {
    for (const tier of ['Seed', 'Cipher', 'Sage', 'Adept', 'Visionary', 'Oracle']) {
      const svg = generateBadgeSVG(profileWithTier(tier))
      expect(svg).toContain(`>${tier}</text>`)
    }
  })
})
