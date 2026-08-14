// src/schema.ts
/**
 * Module tool schemas, defensively.
 *
 * A module that exported a plain JSON Schema object as `inputSchema` took the
 * ENTIRE server down. `tools/list` mapped over every tool calling
 * zodToJsonSchema() unguarded, so one bad module threw inside the handler and
 * discovery failed wholesale:
 *
 *     Cannot read properties of undefined (reading 'typeName')
 *
 * The agent's symptom was not "skills-library is broken" — it was "Datacore
 * has no tools at all". All 69 core tools disappeared because of one module,
 * and diagnosing it took a direct JSON-RPC probe. That happened on plur-claw
 * on 2026-08-13 (datacore-mcp#15).
 *
 * Two independent problems, fixed separately because either alone recurs:
 *
 *   1. ACCEPT BOTH SHAPES. Modules are third-party by design (DIP-0001
 *      fork-and-overlay). Requiring every module author to import the server's
 *      exact Zod version is a coupling that will keep breaking — JSON Schema is
 *      the wire format MCP actually speaks, so a module offering one directly
 *      is reasonable, not malformed.
 *
 *   2. ISOLATE FAILURES. Whatever a module hands us, it must not be able to
 *      remove unrelated tools from the server. Discovery degrades to "this one
 *      module is unavailable"; it does not collapse.
 */

import { z } from 'zod'

/** Zod schemas carry `_def` and a `parse` method; JSON Schema objects do not. */
export function isZodSchema(s: unknown): boolean {
  return (
    typeof s === 'object' &&
    s !== null &&
    '_def' in (s as Record<string, unknown>) &&
    typeof (s as { parse?: unknown }).parse === 'function'
  )
}

/** Does this look like a JSON Schema object we can pass through untouched? */
function looksLikeJsonSchema(s: unknown): boolean {
  if (typeof s !== 'object' || s === null) return false
  const o = s as Record<string, unknown>
  return 'type' in o || 'properties' in o || '$schema' in o || 'anyOf' in o || 'oneOf' in o
}

/**
 * Normalise any supported schema to JSON Schema.
 * Throws only when the value is neither — the caller is expected to catch and
 * skip that one tool.
 */
export function toJsonSchema(s: unknown): object {
  if (isZodSchema(s)) return z.toJSONSchema(s as z.ZodType) as object
  if (looksLikeJsonSchema(s)) return s as object
  throw new Error(
    'inputSchema is neither a Zod schema nor a JSON Schema object ' +
      `(got ${s === null ? 'null' : typeof s})`,
  )
}

/**
 * Validate arguments when we can.
 *
 * A Zod schema validates. A raw JSON Schema does NOT — we deliberately do not
 * pull in a JSON Schema validator to enforce a contract the module itself
 * declared, and the module's handler is the thing that has to be robust to its
 * own inputs anyway. Passing through is the honest behaviour: it is better than
 * pretending validation occurred, and far better than throwing on every call to
 * a tool whose schema shape we chose to accept.
 */
export function validateArgs(schema: unknown, args: unknown): unknown {
  if (isZodSchema(schema)) return (schema as { parse: (a: unknown) => unknown }).parse(args)
  return args
}
