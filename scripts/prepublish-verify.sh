#!/usr/bin/env bash
# The gate between a broken MCP server and every agent that talks to Datacore.
#
# This package had NO prepublishOnly at all. `npm publish` ran the build only if
# someone remembered to, so a bare publish could ship code that never compiled
# and whose tests never ran. The `release` script did run tests — but only if
# you used it, and nothing forced you to.
#
# npm invokes prepublishOnly automatically, so the checks now happen whether or
# not anyone remembers them. That is the entire difference between a gate and a
# good intention.
#
# Every check corresponds to a failure that actually happened in this codebase.
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗ %s\033[0m\n' "$1"; FAIL=1; }

VERSION=$(node -p "require('./package.json').version")
printf '\033[1mPre-publish verification — @datacore-one/mcp %s\033[0m\n' "$VERSION"

step "Tests"
if npm test >/tmp/dc-mcp-test.log 2>&1; then
  ok "$(grep -Eo 'Tests +[0-9]+ passed' /tmp/dc-mcp-test.log | tail -1)"
else
  bad "tests failed:"; grep -E 'FAIL|AssertionError' /tmp/dc-mcp-test.log | head -15
fi

step "Build"
if npm run build >/tmp/dc-mcp-build.log 2>&1; then ok "dist/ built"
else bad "build failed:"; tail -15 /tmp/dc-mcp-build.log; fi

step "Built artifact"
# Exercise the ARTIFACT. The deployed tree on servers has dist/ and no
# package.json, so dist IS the product — and its version is compiled in.
if [ -f dist/index.js ]; then
  BUILT=$(node dist/index.js --version 2>/dev/null | tr -d '[:space:]')
  if [ "$BUILT" = "$VERSION" ]; then
    ok "dist reports $BUILT"
  else
    bad "dist reports '$BUILT' but package.json says '$VERSION'"
  fi
  if node dist/index.js --help >/dev/null 2>&1; then ok "dist starts"
  else bad "dist/index.js will not start"; fi
else
  bad "dist/index.js missing after build"
fi

step "MCP protocol handshake"
# A server that builds and starts can still fail to speak MCP — and an agent
# discovers that only when its tool calls stop working. Do the handshake here.
HANDSHAKE=$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"gate","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | timeout 25 node dist/index.js 2>/dev/null)
if printf '%s' "$HANDSHAKE" | grep -q '"serverInfo"'; then
  ok "initialize answered"
else
  bad "no initialize response — the server does not speak MCP"
fi
TOOLS=$(printf '%s' "$HANDSHAKE" | grep -o '"name":"datacore_[a-z_]*"' | sort -u | wc -l | tr -d ' ')
if [ "${TOOLS:-0}" -gt 0 ]; then
  ok "$TOOLS datacore tool(s) advertised"
else
  bad "tools/list advertised no datacore tools"
fi

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  printf '\n  \033[33m!\033[0m uncommitted changes — published artifact will match no commit\n'
fi

printf '\n'
if [ "$FAIL" -ne 0 ]; then
  printf '\033[31m✗ PUBLISH BLOCKED\033[0m — fix the above.\n'
  exit 1
fi
printf '\033[32m✓ verified — safe to publish %s\033[0m\n' "$VERSION"
