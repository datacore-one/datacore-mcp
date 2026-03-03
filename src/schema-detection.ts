// src/schema-detection.ts
// k-core decomposition + connected component detection for schema discovery.
// Per DIP-0019 Phase 3.

import { decayedCoAccessStrength } from './decay.js'
import { generateSchemaId, type SchemaDefinition } from './schemas/schema-definition.js'
import type { Engram } from './schemas/engram.js'

const MIN_STRENGTH = 0.4
const MIN_MEMBERS = 3
const MIN_SHARED_ANCHORS = 2
const K_CORE = 2
const MAX_EDGES = 10_000
const STALE_DAYS = 90

export interface DetectionResult {
  created: SchemaDefinition[]
  updated: SchemaDefinition[]
  flagged: SchemaDefinition[]
  warning?: string
}

export function detectSchemas(
  engrams: Engram[],
  existing: SchemaDefinition[],
): DetectionResult {
  // Step 1: Build undirected weighted graph from associations
  const adjacency = new Map<string, Set<string>>()
  const engramMap = new Map(engrams.map(e => [e.id, e]))
  const seenEdges = new Set<string>()

  for (const engram of engrams) {
    if (engram.status !== 'active') continue
    for (const assoc of engram.associations) {
      if (assoc.target_type !== 'engram') continue
      const target = engramMap.get(assoc.target)
      if (!target || target.status !== 'active') continue

      // Apply decay for co_accessed associations
      const effectiveStrength = assoc.type === 'co_accessed' && assoc.updated_at
        ? decayedCoAccessStrength(assoc.strength, assoc.updated_at)
        : assoc.strength

      if (effectiveStrength < MIN_STRENGTH) continue

      // Add bidirectional edge (undirected graph), count unique edges only
      if (!adjacency.has(engram.id)) adjacency.set(engram.id, new Set())
      if (!adjacency.has(assoc.target)) adjacency.set(assoc.target, new Set())
      adjacency.get(engram.id)!.add(assoc.target)
      adjacency.get(assoc.target)!.add(engram.id)
      const edgeKey = engram.id < assoc.target
        ? `${engram.id}:${assoc.target}`
        : `${assoc.target}:${engram.id}`
      seenEdges.add(edgeKey)
    }
  }

  // Safety check: abort if graph too large
  if (seenEdges.size > MAX_EDGES) {
    return {
      created: [],
      updated: [],
      flagged: [],
      warning: `Association graph has ${seenEdges.size} edges (limit: ${MAX_EDGES}). Skipping detection to prevent performance issues.`,
    }
  }

  // Step 2: k-core decomposition (k=2)
  let changed = true
  while (changed) {
    changed = false
    for (const [node, neighbors] of adjacency) {
      if (neighbors.size < K_CORE) {
        for (const neighbor of neighbors) {
          adjacency.get(neighbor)?.delete(node)
        }
        adjacency.delete(node)
        changed = true
      }
    }
  }

  // Step 3: Find connected components using BFS
  const visited = new Set<string>()
  const components: string[][] = []

  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue
    const component: string[] = []
    const queue = [node]
    visited.add(node)
    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    components.push(component)
  }

  // Step 4: Filter by minimum members and shared anchors
  const today = new Date().toISOString().split('T')[0]
  const created: SchemaDefinition[] = []
  const updated: SchemaDefinition[] = []

  for (const component of components) {
    if (component.length < MIN_MEMBERS) continue

    // Compute shared anchors
    const anchorCounts = new Map<string, number>()
    for (const id of component) {
      const engram = engramMap.get(id)
      if (!engram) continue
      for (const anchor of engram.knowledge_anchors) {
        anchorCounts.set(anchor.path, (anchorCounts.get(anchor.path) ?? 0) + 1)
      }
    }
    const sharedAnchors = Array.from(anchorCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([path]) => path)

    if (sharedAnchors.length < MIN_SHARED_ANCHORS) continue

    // Compute confidence
    const memberScore = Math.min(component.length / 10, 1.0)
    const anchorScore = Math.min(sharedAnchors.length / 5, 1.0)
    let totalStrength = 0
    let edgePairs = 0
    for (const id of component) {
      const neighbors = adjacency.get(id) ?? new Set()
      for (const neighbor of neighbors) {
        if (component.includes(neighbor)) {
          totalStrength += getMaxStrength(engramMap.get(id)!, neighbor, engramMap)
          edgePairs++
        }
      }
    }
    const avgStrength = edgePairs > 0 ? totalStrength / edgePairs : 0
    const confidence = Math.round(memberScore * anchorScore * avgStrength * 1000) / 1000

    // Match existing schema by member overlap (Jaccard >= 0.5)
    const componentSet = new Set(component)
    let matched = false
    for (const schema of existing) {
      if (schema.status === 'archived') continue
      const schemaSet = new Set(schema.members)
      const intersection = component.filter(id => schemaSet.has(id)).length
      const union = new Set([...component, ...schema.members]).size
      const jaccard = intersection / union
      if (jaccard >= 0.5) {
        updated.push({
          ...schema,
          members: component.sort(),
          shared_anchors: sharedAnchors,
          confidence,
          updated: today,
        })
        matched = true
        break
      }
    }

    if (!matched) {
      const allExisting = [...existing, ...created]
      created.push({
        id: generateSchemaId(allExisting),
        name: `Schema from ${component.length} engrams`,
        members: component.sort(),
        confidence,
        status: 'candidate',
        shared_anchors: sharedAnchors,
        created: today,
        updated: today,
      })
    }
  }

  // Step 7: Flag stale schemas (90+ days since update)
  const flagged: SchemaDefinition[] = []
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - STALE_DAYS)
  const staleDateStr = staleDate.toISOString().split('T')[0]

  for (const schema of existing) {
    if (schema.status === 'archived') continue
    if (schema.updated < staleDateStr) {
      flagged.push(schema)
    }
  }

  return { created, updated, flagged }
}

function getMaxStrength(engram: Engram, targetId: string, engramMap: Map<string, Engram>): number {
  let max = 0
  for (const assoc of engram.associations) {
    if (assoc.target === targetId) {
      const effective = assoc.type === 'co_accessed' && assoc.updated_at
        ? decayedCoAccessStrength(assoc.strength, assoc.updated_at)
        : assoc.strength
      if (effective > max) max = effective
    }
  }
  // Also check reverse
  const target = engramMap.get(targetId)
  if (target) {
    for (const assoc of target.associations) {
      if (assoc.target === engram.id) {
        const effective = assoc.type === 'co_accessed' && assoc.updated_at
          ? decayedCoAccessStrength(assoc.strength, assoc.updated_at)
          : assoc.strength
        if (effective > max) max = effective
      }
    }
  }
  return max
}
