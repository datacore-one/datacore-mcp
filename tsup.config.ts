import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node22',
    clean: true,
    dts: false,
    sourcemap: true,
    external: ['better-sqlite3'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/runtime.ts'],
    format: ['esm', 'cjs'],
    target: 'node22',
    clean: false,
    dts: false,
    sourcemap: false,
    outDir: 'dist',
  },
])
