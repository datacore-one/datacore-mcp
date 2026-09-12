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
import { zodToJsonSchema } from 'zod-to-json-schema'
import { Ajv, type ValidateFunction } from 'ajv'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const options = { strict: false, strictSchema: true, ownProperties: true, allErrors: false }
const validators = new WeakMap<object, { serialized: string; validate: ValidateFunction }>()

export class ArgumentValidationError extends Error {
  constructor() { super('Arguments do not satisfy the tool schema') }
}

function jsonValidator(schema: object): ValidateFunction {
  const serialized = JSON.stringify(schema)
  const cached = validators.get(schema)
  if (!cached || cached.serialized !== serialized) {
    const uri = (schema as {$schema?: unknown}).$schema
    // Module-local $id values must not share a validator's global namespace.
    const compiler = typeof uri === 'string' && uri.includes('2020-12') ? new Ajv2020(options) : new Ajv(options)
    addFormats(compiler)
    const validate = compiler.compile(schema)
    validators.set(schema, { serialized, validate })
    return validate
  }
  return cached.validate
}

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
  if (isZodSchema(s)) {
    return '_zod' in (s as object) ? z.toJSONSchema(s as z.ZodType) as object
      : zodToJsonSchema(s as never) as object
  }
  if (looksLikeJsonSchema(s)) {
    jsonValidator(s as object)
    return s as object
  }
  throw new Error(
    'inputSchema is neither a Zod schema nor a JSON Schema object ' +
      `(got ${s === null ? 'null' : typeof s})`,
  )
}

/**
 * Enforce the declared contract for either supported schema representation.
 * No remote references are fetched and failed validation never coerces,
 * removes or defaults caller data. Business authorization remains the handler's
 * responsibility. Invalid contracts are rejected during tool registration.
 */
export function validateArgs(schema: unknown, args: unknown): unknown {
  if (isZodSchema(schema)) {
    try { return (schema as { parse: (a: unknown) => unknown }).parse(args) }
    catch { throw new ArgumentValidationError() }
  }
  if (!looksLikeJsonSchema(schema) || !jsonValidator(schema as object)(args)) {
    throw new ArgumentValidationError()
  }
  return args
}
