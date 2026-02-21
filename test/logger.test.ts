// test/logger.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We need to test the Logger class, so we re-import after env manipulation
describe('Logger', () => {
  const originalEnv = process.env.DATACORE_LOG_LEVEL
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    process.env.DATACORE_LOG_LEVEL = originalEnv
    vi.resetModules()
  })

  it('formats messages with level prefix', async () => {
    process.env.DATACORE_LOG_LEVEL = 'debug'
    const { logger } = await import('../src/logger.js')
    logger.debug('test message')
    expect(stderrSpy).toHaveBeenCalledWith('[datacore:debug] test message\n')
  })

  it('respects level filter (default warning)', async () => {
    delete process.env.DATACORE_LOG_LEVEL
    const { logger } = await import('../src/logger.js')
    logger.debug('should not appear')
    logger.info('should not appear')
    expect(stderrSpy).not.toHaveBeenCalled()
    logger.warning('should appear')
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })

  it('truncates messages over 4KB', async () => {
    process.env.DATACORE_LOG_LEVEL = 'debug'
    const { logger } = await import('../src/logger.js')
    const longMsg = 'x'.repeat(5000)
    logger.debug(longMsg)
    const written = stderrSpy.mock.calls[0][0] as string
    expect(written.length).toBeLessThanOrEqual(4096 + 20) // prefix + newline
    expect(written).toContain('...')
  })

  it('works without MCP server connection', async () => {
    process.env.DATACORE_LOG_LEVEL = 'error'
    const { logger } = await import('../src/logger.js')
    // Should not throw
    logger.error('standalone error')
    expect(stderrSpy).toHaveBeenCalledWith('[datacore:error] standalone error\n')
  })
})
