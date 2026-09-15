/**
 * @datacore-one/mcp/runtime
 *
 * Stable re-export surface for runtime dependencies that built-in module
 * tools may import without bundling their own copies.
 *
 * Usage in module tools/index.ts:
 *   import { z, yaml } from '@datacore-one/mcp/runtime'
 *
 * DIP-0049 (Draft) discusses module runtime dependencies. This export must
 * itself be resolvable from the module's installed package environment;
 * exports alone do not add a global ESM search path.
 */

export { z } from 'zod'
export * as yaml from 'js-yaml'

// Installed module bridges share the same explicit interpreter selection.
export { findPython } from './runtime-python.js'
