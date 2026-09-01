# Changelog

## [2.1.2] — 2026-08-29

- Zero open Dependabot alerts: `hono`, `body-parser`, and `nanoid` pinned via `overrides` — all medium/low alerts resolved
- `modules-health` tool output improved with richer status reporting; module load failure surfacing fixed
- HTTP test timeout fixed (dynamic import takes ~6s in isolated worker)

## [2.1.1] — 2026-08-18

- **HIGH-severity security fixes**: `fast-uri` (host-confusion SSRF) and `ip-address` (decimal/octal parsing bypass) — overrides were already in `package.json`; lock file regenerated to apply them
- Module load failures now surface in the MCP health tool — previously silent at startup
- TypeScript upgraded 5.9.3 → 7.0.2

## [2.1.0] — 2026-08-15

- Zod upgraded v3 → v4 (fixes compatibility with modern schema definitions in module manifests)
- **datacore-v2 knowledge pack** — eight invariants distilled from real production incidents, shipped as a built-in knowledge pack
- README reframed: leads with orchestration/agent framing rather than "second brain" — more accurate to what Datacore actually does at v2.x
- CI: test files serialized to eliminate scheduling-luck failures

## [2.0.2] — 2026-08-15

- A module with a raw JSON Schema as `inputSchema` (instead of a Zod schema) previously caused all 69 core tools to vanish from `tools/list`. Fixed: bad modules are now skipped with a structured warning; the rest load normally.

## [2.0.1] — 2026-08-15

- Minor stability fix following v2.0.0 release

## [2.0.0] — 2026-08-15

The `status` tool now answers what Datacore is doing right now, not what it's configured to do. Agents get a human-readable state summary instead of a raw JSON config dump.

Infrastructure modernization:
- `@modelcontextprotocol/sdk` bumped 1.26 → 1.30
- `better-sqlite3` v12 → v13
- `js-yaml` v4 → v5
- 4 high-severity dependency vulnerabilities patched
- Node 24 in CI matrix (Node 22–24 now tested)
- `publish` is gated — requires explicit confirmation to prevent accidental writes during dry-run workflows

## [1.6.0] — 2026-08-10

**Breaking change:** All engram tools — `learn`, `inject`, `recall`, `promote`, `feedback`, `forget`, packs, and the XP layer — have moved out of Datacore into the companion [PLUR MCP server](https://www.npmjs.com/package/@plur-ai/mcp).

The split clarifies what each package does:
- **Datacore** — organization: GTD (journal, tasks, next actions), Zettelkasten (notes, knowledge graph), agent workflows
- **PLUR** — memory: persistent engrams, session injection, corrections and preferences that survive across sessions

Upgrade path:
```bash
npm install -g @plur-ai/mcp
```

Also included: multi-space search (all `[0-9]-*` spaces auto-discovered), FTS5 full-text search for fast recall, confidence scoring with sample-size dampening, polarity classifier for don't-pattern detection, session breadcrumbs for cross-session continuity.

**MCP tool name fix:** Tool names now use underscores (`datacore_capture`) instead of dots (`datacore.capture`) — required for Claude Desktop and other strict MCP clients. Dot-namespaced names remain as aliases.

---

For older releases, see [GitHub Releases](https://github.com/datacore-one/datacore-mcp/releases).
