// One owner clears shared output before any parallel entry point can publish.
import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })
const result = spawnSync(process.execPath,
  [fileURLToPath(new URL('../node_modules/tsup/dist/cli-default.js', import.meta.url))],
  { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
