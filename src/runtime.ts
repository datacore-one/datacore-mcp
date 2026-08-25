/**
 * @datacore-one/mcp/runtime
 *
 * Stable re-export surface for runtime dependencies that built-in module
 * tools may import without bundling their own copies.
 *
 * Usage in module tools/index.ts:
 *   import { z, yaml } from '@datacore-one/mcp/runtime'
 *
 * DIP-0028 §4 — Module Runtime Dependencies
 */

export { z } from 'zod'
export * as yaml from 'js-yaml'
