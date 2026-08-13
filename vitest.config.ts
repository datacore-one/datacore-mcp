import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
    // Run test FILES one at a time.
    //
    // Several suites spawn real processes — `npx tsx` for the CLI flags, an
    // HTTP listener, and full MCP servers over stdio for module isolation.
    // Run in parallel they starve each other: every file passed alone and the
    // suite failed together, with timings that moved run to run. Raising the
    // individual timeouts made it strictly worse (5 failures, 176s) because
    // the contention, not the budget, was the constraint.
    //
    // This is a publish gate. A gate that fails on scheduling luck teaches
    // people to rerun until it is green, which is worse than having no gate —
    // so determinism is worth more here than wall-clock.
    fileParallelism: false,
  },
})
