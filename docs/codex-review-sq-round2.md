# Codex Review: Speed Queen Integration (Round 2)
**Date:** 2026-02-17
**Branch:** fix/codex-review-sq-8issues vs main

## Critical (1)

### 1. Command whitelist bypass via params.type override
- **Files:** speedqueen.ts:263, 266, 282
- **Impact:** buildCommand() returns { type: AllowedType, ...params } — caller can send params.type to override the validated command type
- **Fix:** Build as { ...params, type: AllowedType } and explicitly reject params.type

## High (2)

### 1. Raw vendor error bodies logged server-side
- **Files:** speedqueen.ts:186, 188
- **Fix:** Log only status/path or redact sensitive fields

### 2. Command params are unvalidated passthrough
- **Files:** index.ts:2025, 2040, speedqueen.ts:263
- **Fix:** Add per-command input schemas, reject unknown keys

## Medium (4)

### 1. Client/mapping errors returned as 500 instead of 4xx
- **Files:** index.ts:2039, 2045, 2057, 2061, speedqueen.ts:857, 872
- **Fix:** Map known errors (No Speed Queen mapping) to 404/400

### 2. No timeout/retry on vendor fetches
- **Files:** speedqueen.ts:184, 240
- **Fix:** Use AbortController timeouts + bounded retry/backoff

### 3. source may report speedqueen without usable mapping
- **Files:** index.ts:1938, speedqueen.ts:915
- **Fix:** Derive source from active service + per-agent mapping availability

### 4. Tight coupling in main server file
- **Files:** index.ts:1845, 1894, 1899
- **Fix:** Move SQ endpoints to dedicated router; shared typed service interface

## Low (3)

### 1. Mock service doesnt model out-of-order toggle correctly
- **Files:** speedqueen-mock.ts:348, 350

### 2. Potential state update after unmount in UI timeout
- **File:** MachineDetailPanel.tsx:88

### 3. Operational artifact committed to repo
- **File:** memory/agent-monitor-state.json
- **Fix:** Remove and add to .gitignore

## Test Coverage Gaps (5)

1. No test for params.type override bypass
2. No API tests for malformed/unknown command params rejection
3. No tests for 404/400 on unknown machine/agent command flows
4. No resilience tests for timeout/abort/retry
5. No test for /api/agents/:id/machines source correctness when SQ env-enabled but not mapped

## ALSO FIX: Pre-existing test failures

3 tests fail in components/__tests__/groupsForm.test.tsx due to __APP_VERSION__ not defined.
Fix these too — ALL tests must be green.
