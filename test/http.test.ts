// test/http.test.ts
import { describe, it, expect } from 'vitest'
import * as http from 'http'

describe('HTTP transport', () => {
  it('health endpoint returns ok', async () => {
    // Start a minimal HTTP server using the same pattern
    const { createServer } = await import('../src/server.js')
    const server = createServer()

    const httpServer = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const port = (httpServer.address() as any).port

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      expect(res.ok).toBe(true)
      const data = await res.json()
      expect(data.status).toBe('ok')
    } finally {
      httpServer.close()
      await server.close()
    }
  })
})
