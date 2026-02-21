// test/cli.test.ts
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import * as path from 'path'

const indexPath = path.join(__dirname, '..', 'src', 'index.ts')

describe('CLI flags', () => {
  it('--version prints version string', () => {
    const output = execSync(`npx tsx ${indexPath} --version`, { encoding: 'utf8', timeout: 10000 }).trim()
    expect(output).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('--help prints usage information', () => {
    const output = execSync(`npx tsx ${indexPath} --help`, { encoding: 'utf8', timeout: 10000 })
    expect(output).toContain('Datacore MCP Server')
    expect(output).toContain('datacore.capture')
    expect(output).toContain('datacore.learn')
    expect(output).toContain('DATACORE_PATH')
  })
})
