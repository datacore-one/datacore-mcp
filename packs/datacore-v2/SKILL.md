---
name: Datacore v2 Operating Rules
description: Invariants for the ledger-era fleet — merge never rebase, ownership by authorship, unknown is not broken, verify the artifact
version: "1.0.0"
creator: Datacore
license: MIT
tags: [datacore-v2, ledger, git, sync, reliability, dip-0046]
x-datacore:
  id: datacore-v2
  injection_policy: on_match
  match_terms: [rebase, merge, git pull, sync, converge, ledger, event log, jsonl, pre-push, ownership, doctor, datacore_status, publish, prepublish, python3, module tool, tools/list, seq-gap, job_verify]
  domain: datacore.v2
  engram_count: 8
---

# Datacore v2 Operating Rules

Eight invariants for working in the ledger-era fleet. Each one is here because
it was learned the expensive way — the rationale on every engram names the
incident, not a specification.

These are **operating rules, not a changelog**. They answer questions an agent
hits in the middle of doing something, when getting it wrong costs work.

## The rules

1. **Merge, never rebase.** Rebase renames your unpushed commits; a failed push
   then leaves them under an identity nobody else has seen. 50 commits lost this
   way on 2026-08-12.
2. **You own what you authored, not what you carry.** After a merge, other
   actors' commits legitimately sit in your push range.
3. **`SKIP_PRE_PUSH` is for hand-repairing a log, never for unblocking a push.**
   A guard that fires on ordinary work teaches everyone to bypass it.
4. **Unknown ≠ broken.** Health checks report three states, not two.
5. **Python 3.10+.** macOS `python3` is 3.9 and fails at *import*, not runtime.
6. **One failure must not remove unrelated capability.** One bad module took
   away all 69 MCP tools.
7. **Know which checkout your job runs from.** The Mac's detectors run from
   `~/.datacore/v2-runner`, not `~/Data`.
8. **Verify the artifact, and gate publishing mechanically.** A source test
   passed while the shipped bundle still had the bug.

## Why a separate pack

This is deliberately *not* merged into the general Datacore packs. v2 changed
what is true about the system — an agent should be able to tell "this is how v2
works" from "this is Datacore generally", and this pack can be revoked cleanly
at the next re-genesis without disturbing anything else.

## Scope

Applies to every machine in the fleet: mac, winston, nightshift, hermes,
plur-claw. If a rule here contradicts what you observe, the observation wins —
report it rather than working around it. Three of these eight exist because
someone reported a contradiction instead of routing around it.
