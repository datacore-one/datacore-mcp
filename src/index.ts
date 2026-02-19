import { runStdio } from './server.js'

runStdio().catch((error) => {
  console.error('Failed to start Datacore MCP server:', error)
  process.exit(1)
})
