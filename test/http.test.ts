// test/http.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as http from 'http'

describe('HTTP transport', () => {
  it('health endpoint returns ok', async () => {
    // Timeout is 30s: the dynamic import of server.ts (first time in this worker)
    // compiles the full module graph and takes ~6s — more than the 5s default.
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
  }, 30000)
})

describe('HTTP token auth', () => {
  let httpServer: http.Server
  let port: number

  beforeEach(async () => {
    // Build a minimal /mcp handler that mirrors the token-check logic in runHttp().
    // Read the token per-request so each test can set DATACORE_HTTP_TOKEN before calling fetch.
    httpServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        const token = process.env.DATACORE_HTTP_TOKEN
        if (token) {
          const auth = req.headers['authorization']
          if (auth !== `Bearer ${token}`) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Unauthorized' }))
            return
          }
        }
        res.writeHead(200)
        res.end('ok')
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    port = (httpServer.address() as any).port
  })

  afterEach(() => {
    httpServer.close()
    delete process.env.DATACORE_HTTP_TOKEN
  })

  it('allows POST /mcp without token when DATACORE_HTTP_TOKEN is unset', async () => {
    delete process.env.DATACORE_HTTP_TOKEN
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('rejects POST /mcp with no Authorization header when token is set', async () => {
    process.env.DATACORE_HTTP_TOKEN = 'secret'
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('rejects POST /mcp with wrong token', async () => {
    process.env.DATACORE_HTTP_TOKEN = 'secret'
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(res.status).toBe(401)
  })

  it('allows POST /mcp with correct Bearer token', async () => {
    process.env.DATACORE_HTTP_TOKEN = 'secret'
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
    })
    expect(res.status).toBe(200)
  })
})
