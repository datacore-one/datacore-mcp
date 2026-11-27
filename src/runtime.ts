/**
 * @datacore-one/mcp/runtime
 *
 * Stable re-export surface for runtime dependencies that built-in module
 * tools may import without bundling their own copies.
 *
 * Usage in module tools/index.ts:
 *   import { z, yaml } from '@datacore-one/mcp/runtime'
 *
 * DIP-0049 (Draft) discusses module runtime dependencies. Inside the server,
 * the module loader binds this specifier to the loading server's own copy
 * (bindModuleRuntime in modules.ts), so a module always gets the runtime of
 * the server that runs it, with no install beside the module. Outside the
 * server (a module's own tests) it resolves from the package environment.
 */

export { z } from 'zod'
export * as yaml from 'js-yaml'

// Installed module bridges share the same explicit interpreter selection.
export { findPython } from './runtime-python.js'
