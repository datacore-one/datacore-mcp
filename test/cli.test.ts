// test/cli.test.ts
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import * as path from 'path'

const indexPath = path.join(__dirname, '..', 'dist', 'index.js')

describe('CLI flags', () => {
  it('--version prints version string', () => {
    const output = execFileSync(process.execPath, [indexPath, '--version'], { encoding: 'utf8', timeout: 10000 }).trim()
    expect(output).toMatch(/^\d+\.\d+\.\d+/)
  }, 60000)

  it('--help prints usage information', () => {
    const output = execFileSync(process.execPath, [indexPath, '--help'], { encoding: 'utf8', timeout: 10000 })
    expect(output).toContain('Datacore MCP Server')
    expect(output).toContain('datacore_capture')
    expect(output).toContain('datacore_search')
    expect(output).toContain('PLUR MCP')
    expect(output).toContain('DATACORE_PATH')
  }, 60000)
})
