// test/tools/gtd-integration.test.ts
// Integration test: validates MCP server discovers GTD module tools
// and can route calls to them end-to-end.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { discoverModules, loadModuleTools } from '../../src/modules.js'
import type { StorageConfig } from '../../src/storage.js'

let tmpDir: string

function makeStorage(basePath: string): StorageConfig {
  return {
    mode: 'full',
    basePath,
    engramsPath: path.join(basePath, '.datacore', 'learning', 'engrams.yaml'),
    journalPath: path.join(basePath, '0-personal', 'journal'),
    knowledgePath: path.join(basePath, '0-personal', '3-knowledge'),
    packsPath: path.join(basePath, '.datacore', 'learning', 'packs'),
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-gtd-test-'))
  // Create full Datacore structure
  fs.mkdirSync(path.join(tmpDir, '.datacore', 'modules'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '0-personal', 'org'), { recursive: true })

  // Copy GTD module (symlink-like: copy module.yaml + tools/index.js)
  const gtdDir = path.join(tmpDir, '.datacore', 'modules', 'gtd')
  const gtdToolsDir = path.join(gtdDir, 'tools')
  fs.mkdirSync(gtdToolsDir, { recursive: true })

  // Write module.yaml
  fs.writeFileSync(path.join(gtdDir, 'module.yaml'), yaml.dump({
    manifest_version: 2,
    name: 'gtd',
    builtin: true,
    provides: {
      tools: [
        { name: 'inbox_count', description: 'Count inbox items', handler: 'tools/inbox_count.ts' },
        { name: 'add_task', description: 'Add task', handler: 'tools/add_task.ts' },
        { name: 'list_next_actions', description: 'List tasks', handler: 'tools/list.ts' },
        { name: 'complete_task', description: 'Complete task', handler: 'tools/complete.ts' },
      ],
    },
  }))

  // Copy the actual tools/index.js from the real GTD module
  const realToolsJs = path.resolve(__dirname, '../../../.datacore/modules/gtd/tools/index.js')
  if (fs.existsSync(realToolsJs)) {
    fs.copyFileSync(realToolsJs, path.join(gtdToolsDir, 'index.js'))
  } else {
    // Inline minimal implementation for CI
    fs.writeFileSync(path.join(gtdToolsDir, 'index.js'), `
      import { z } from 'zod';
      import * as fs from 'fs';
      import * as path from 'path';
      function findOrgFile(basePath, space, filename) {
        if (space) { const p = path.join(basePath, space, 'org', filename); if (fs.existsSync(p)) return p; }
        const personal = path.join(basePath, '0-personal', 'org', filename);
        if (fs.existsSync(personal)) return personal;
        return null;
      }
      function countHeadings(content) {
        let count = 0;
        for (const line of content.split('\\n')) { if (/^\\*+\\s+(TODO|NEXT|WAITING)\\s/.test(line)) count++; }
        return count;
      }
      export const tools = [
        {
          name: 'inbox_count',
          description: 'Count inbox items',
          inputSchema: z.object({ space: z.string().optional() }),
          handler: async (args, ctx) => {
            const orgPath = findOrgFile(ctx.storage.basePath, args.space || '0-personal', 'inbox.org');
            if (!orgPath) return { error: 'No inbox.org found' };
            return { count: countHeadings(fs.readFileSync(orgPath, 'utf-8')) };
          },
        },
        {
          name: 'add_task',
          description: 'Add task',
          inputSchema: z.object({ title: z.string(), space: z.string().optional() }),
          handler: async (args, ctx) => {
            const orgPath = findOrgFile(ctx.storage.basePath, args.space || '0-personal', 'inbox.org');
            if (!orgPath) return { error: 'No inbox.org' };
            fs.appendFileSync(orgPath, '\\n** TODO ' + args.title + '\\n');
            return { added: true, title: args.title };
          },
        },
      ];
    `)
  }

  // Create inbox.org with some tasks
  fs.writeFileSync(path.join(tmpDir, '0-personal', 'org', 'inbox.org'), `* Inbox
** TODO Buy groceries
** TODO Review PR #42
** NEXT Read DIP-0022
`)

  // Create next_actions.org
  fs.writeFileSync(path.join(tmpDir, '0-personal', 'org', 'next_actions.org'), `* Tasks
** TODO Implement MCP tools                  :AI:technical:
** NEXT Write integration tests
** WAITING Response from legal               :ops:
** TODO Update CLAUDE.md                     :AI:
`)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('GTD Module Integration', () => {
  it('discovers GTD module with 4 tools', () => {
    const modules = discoverModules(makeStorage(tmpDir))
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('gtd')
    expect(modules[0].manifest.provides?.tools).toHaveLength(4)
  })

  it('loads GTD tools with correct namespace', async () => {
    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))

    // At least inbox_count and add_task should load
    expect(tools.length).toBeGreaterThanOrEqual(2)

    const names = tools.map(t => t.fullName)
    expect(names).toContain('datacore.gtd.inbox_count')
    expect(names).toContain('datacore.gtd.add_task')
  })

  it('inbox_count returns correct count', async () => {
    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))
    const inboxCount = tools.find(t => t.fullName === 'datacore.gtd.inbox_count')!

    const result = await inboxCount.definition.handler(
      { space: '0-personal' },
      inboxCount.context,
    ) as Record<string, unknown>

    expect(result.count).toBe(3) // TODO Buy groceries, TODO Review PR, NEXT Read DIP
  })

  it('add_task appends to inbox.org', async () => {
    const modules = discoverModules(makeStorage(tmpDir))
    const tools = await loadModuleTools(modules, makeStorage(tmpDir))
    const addTask = tools.find(t => t.fullName === 'datacore.gtd.add_task')!

    const result = await addTask.definition.handler(
      { title: 'New test task', space: '0-personal' },
      addTask.context,
    ) as Record<string, unknown>

    expect(result.added).toBe(true)

    // Verify it was actually written
    const content = fs.readFileSync(
      path.join(tmpDir, '0-personal', 'org', 'inbox.org'),
      'utf-8',
    )
    expect(content).toContain('New test task')
  })
})
