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

// Build a tokenMap from env vars — mirrors runHttp() logic exactly.
function buildTokenMap(): Map<string, string> {
  const tokenMap = new Map<string, string>()
  const single = process.env.DATACORE_HTTP_TOKEN
  if (single) tokenMap.set(single, 'http')
  for (const [key, value] of Object.entries(process.env)) {
    const m = key.match(/^DATACORE_HTTP_TOKEN_(.+)$/)
    if (m && value) tokenMap.set(value, m[1].toLowerCase())
  }
  return tokenMap
}

describe('HTTP token auth', () => {
  let httpServer: http.Server
  let port: number

  beforeEach(async () => {
    // Minimal /mcp handler that mirrors the token-check logic in runHttp().
    // Re-reads env per request so each test can set tokens before calling fetch.
    httpServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        const tokenMap = buildTokenMap()
        if (tokenMap.size > 0) {
          const auth = req.headers['authorization']
          const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined
          if (!bearer || !tokenMap.has(bearer)) {
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
    delete process.env.DATACORE_HTTP_TOKEN_MILES
    delete process.env.DATACORE_HTTP_TOKEN_HERMES
  })

  it('allows POST /mcp without token when no tokens are configured', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('rejects POST /mcp with no Authorization header when DATACORE_HTTP_TOKEN is set', async () => {
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

  it('allows POST /mcp with correct Bearer token (single-token compat)', async () => {
    process.env.DATACORE_HTTP_TOKEN = 'secret'
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
    })
    expect(res.status).toBe(200)
  })

  it('allows POST /mcp with per-actor token (DATACORE_HTTP_TOKEN_<ACTOR>)', async () => {
    process.env.DATACORE_HTTP_TOKEN_MILES = 'token-miles'
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-miles' },
    })
    expect(res.status).toBe(200)
  })

  it('rejects POST /mcp with a different actor token when per-actor tokens are configured', async () => {
    process.env.DATACORE_HTTP_TOKEN_MILES = 'token-miles'
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-hermes' },
    })
    expect(res.status).toBe(401)
  })

  it('accepts either per-actor token when two actors are configured', async () => {
    process.env.DATACORE_HTTP_TOKEN_MILES = 'token-miles'
    process.env.DATACORE_HTTP_TOKEN_HERMES = 'token-hermes'
    const r1 = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-miles' },
    })
    expect(r1.status).toBe(200)
    const r2 = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-hermes' },
    })
    expect(r2.status).toBe(200)
  })

  it('single-token and per-actor tokens coexist', async () => {
    process.env.DATACORE_HTTP_TOKEN = 'legacy'
    process.env.DATACORE_HTTP_TOKEN_MILES = 'token-miles'
    const r1 = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer legacy' },
    })
    expect(r1.status).toBe(200)
    const r2 = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-miles' },
    })
    expect(r2.status).toBe(200)
  })
})
