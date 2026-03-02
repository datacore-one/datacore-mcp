// src/engagement/badge.ts — deterministic SVG badge generator
import type { EngagementProfile } from './types.js'

const TIER_SHAPES: Record<string, string> = {
  Seed: 'circle',
  Cipher: 'diamond',
  Sage: 'hexagon',
  Adept: 'octagon',
  Visionary: 'star',
  Oracle: 'shield',
}

const TIER_COLORS: Record<string, string> = {
  Seed: '#8B9467',
  Cipher: '#5B8FA8',
  Sage: '#7B68AE',
  Adept: '#C07C3E',
  Visionary: '#3EA5C0',
  Oracle: '#D4AF37',
}

function shapePath(shape: string, cx: number, cy: number, r: number): string {
  switch (shape) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="${r}" />`
    case 'diamond': {
      return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" />`
    }
    case 'hexagon': {
      const points = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      }).join(' ')
      return `<polygon points="${points}" />`
    }
    case 'octagon': {
      const points = Array.from({ length: 8 }, (_, i) => {
        const angle = (Math.PI / 4) * i - Math.PI / 8
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      }).join(' ')
      return `<polygon points="${points}" />`
    }
    case 'star': {
      const points = Array.from({ length: 10 }, (_, i) => {
        const angle = (Math.PI / 5) * i - Math.PI / 2
        const radius = i % 2 === 0 ? r : r * 0.5
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
      }).join(' ')
      return `<polygon points="${points}" />`
    }
    case 'shield': {
      return `<path d="M${cx},${cy - r} L${cx + r * 0.8},${cy - r * 0.5} L${cx + r * 0.8},${cy + r * 0.3} L${cx},${cy + r} L${cx - r * 0.8},${cy + r * 0.3} L${cx - r * 0.8},${cy - r * 0.5} Z" />`
    }
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${r}" />`
  }
}

export function generateBadgeSVG(profile: EngagementProfile): string {
  const tier = profile.tier.current
  const shape = TIER_SHAPES[tier] ?? 'circle'
  const baseColor = TIER_COLORS[tier] ?? '#666666'

  // Reputation affects color intensity (0 = muted, 1.0 = vivid)
  const intensity = Math.min(1.0, profile.reputation.score)
  const opacity = 0.4 + (intensity * 0.6) // 0.4 to 1.0

  // Domains = number of facet lines
  const domains = Math.min(8, profile.stats.domains_covered)

  // Verification = gold border
  const borderColor = profile.identity.erc8004_registered ? '#FFD700' : '#333333'
  const borderWidth = profile.identity.erc8004_registered ? 3 : 1

  const cx = 60
  const cy = 60
  const r = 45

  const facetLines = Array.from({ length: domains }, (_, i) => {
    const angle = (2 * Math.PI / Math.max(domains, 1)) * i
    const x2 = cx + r * 0.7 * Math.cos(angle)
    const y2 = cy + r * 0.7 * Math.sin(angle)
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${baseColor}" stroke-opacity="0.3" stroke-width="1" />`
  }).join('\n    ')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%">
      <stop offset="0%" stop-color="${baseColor}" stop-opacity="${opacity}" />
      <stop offset="100%" stop-color="${baseColor}" stop-opacity="${opacity * 0.5}" />
    </radialGradient>
  </defs>
  <g fill="url(#bg)" stroke="${borderColor}" stroke-width="${borderWidth}">
    ${shapePath(shape, cx, cy, r)}
  </g>
  <g>
    ${facetLines}
  </g>
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="monospace" font-size="11" fill="white" font-weight="bold">${tier}</text>
</svg>`
}
