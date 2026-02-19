// src/version.ts
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

export const currentVersion: string = pkg.version

export async function checkForUpdate(): Promise<string | null> {
  try {
    const res = await fetch('https://registry.npmjs.org/@datacore-one/mcp/latest', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json() as { version: string }
    if (data.version !== currentVersion) return data.version
    return null
  } catch {
    return null
  }
}
