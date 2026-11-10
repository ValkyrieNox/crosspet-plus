# macOS Plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the native macOS CrossPet with the existing Plus task/approval/SSH backend in one buildable application.

**Architecture:** Retain Swift/AppKit/WKWebView and embed the existing Electron service. Share its snapshot and command protocol, merging native hook observations in a Foundation-only Swift model.

**Tech Stack:** Swift, AppKit, Electron, Node.js 22.12+, shell, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-10-macos-plus-design.md`

## Global Constraints

- macOS 13+, packaged arm64 or x64 service matching the requested architecture.
- Preserve original frontend interactions, existing approval decisions and personal configuration.
- No local WSL on Mac; reuse local and SSH support.
- Do not publish or replace an installed application.
- Do not execute the upstream installer from Plus.

## Review Focus

- Stale/foreign-host snapshots must not animate pets or accept commands.
- Native events must not erase Plus sessions or double-count the same local session.
- Initial menu clicks must survive backend startup; failure must be visible.
- Backend restart and main-app exit must not leave ghost state or competing hosts.
- Multi-monitor negative coordinates and ZIP framework symlinks must be preserved.

### Task 1: Swift bridge model and protocol

**Files:** `app/mac/ClawdBridge.swift`, `tests/macos_plus_bridge.swift`, `tests/macos_plus_bridge.sh`, `desktop/src/crosspet-service.js`, `tests/crosspet_service.test.js`.

**Interfaces:** `ClawdSnapshot.parse(data:now:hostPid:)`; `ClawdPresentation` merges sessions and arbitrates event freshness; `ClawdBridge` starts, polls, queues allowlisted commands, and stops its owned backend. Snapshot gains `hostPid` without breaking Windows.

- [x] Write Swift tests for schema/host/heartbeat validation, native/remote merge, child counts, event freshness, AppKit coordinate conversion and host lock exclusion. Run and observe missing-model failure.
- [x] Implement the model, host lock, command queue and lifecycle. Add Node protocol tests using isolated temporary directories and real command files. Observe failure for absent host identity, then add it.
- [x] Run Swift and bridge Node tests until green.

### Task 2: Integrate the native Mac app

**Files:** `App.swift`, `App+Clawd.swift`, `App+State.swift`, `App+Companions.swift`, `App+Menu.swift`, `App+Autostart.swift`, `main.swift`.

**Interfaces:** App delegates polling/merge/navigation to Task 1; menus dispatch dashboard/approvals/agents/connections; native shutdown stops its owned service.

- [x] Exercise launch queue and stale-cache behavior with a fake executable in Swift tests before implementing lifecycle wiring.
- [x] Wire startup lock, session merge, multi-pet cache, four menus, menu failure reporting and converted anchor coordinates.
- [x] Typecheck and build both native architectures; run original frontend regression tests.

### Task 3: Package, start and update safely

**Files:** `scripts/build-macos.cjs`, `scripts/start-native.cjs`, `app/build.sh`, `App+Update.swift`, `package.json`, `.github/workflows/build-desktop.yml`, `tests/macos_plus_build.test.js`.

**Interfaces:** `npm run build:mac` and `build:mac:dir` accept `--arch=arm64|x64`; native upstream command remains available. Bundle marker selects Plus runtime and manual fork-only updates.

- [x] Write behavioral tests for build argument/architecture validation, runtime layout checks, copied symlink preservation and Mac startup selection. Run failing tests.
- [x] Implement matching-architecture runtime packaging, nested ad-hoc signing, licensing, ZIP output, Mac start command, fork update behavior and CI matrix.
- [x] Build local arm64 app and ZIP, verify architecture and codesign; compile Intel frontend without claiming Intel GUI verification.

### Task 4: Verify and document

**Files:** `tests/macos_plus_service_smoke.cjs`, `README.md`, `docs/CROSSPET-PLUS.md`.

- [x] Run real Electron with isolated bridge test data; open native callback windows, exchange heartbeat/commands, and assert cleanup. Do not run the full integration installer against personal settings.
- [x] Run relevant backend tests and original web tests, inspect generated package, and document commands and actual verification limits.
- [x] Request a fresh review of the complete diff, fix material findings with regression tests, and report the deliverable.

## Execution ledger

- Baseline: original web tests 236/236 passed; Swift typecheck started.
- Ruling: work directly on a new `feat/macos-plus` branch in this freshly cloned checkout, following the user's request to implement directly without further setup questions. No shared branch push or merge.
- Ruling: protocol smoke tests use the real bridge module with isolated fixture windows rather than running startup integration synchronization against the user's actual hooks.

- Baseline Swift typecheck passed. Root web Node suite is now 240/240; Swift bridge suite passed, including asynchronous owned-child retry.
- Final: fixed older-session playback regression — latest actor selection/native-file precedence RED→GREEN; root suite 240/240.
- Final: fixed stale webpage and companion routing — tagged-instance cleanup RED→GREEN plus full-page asking/legacy-routing regression.
- Final: fixed exited/stalled owned-backend recovery — bounded restart/backoff and explicit retry RED→GREEN.
- Ruling: root page regression harness initially failed on the unchanged HEAD too (missing Collaboration dependency/DOM fixture). Updated that harness to load the existing dependency and include its element, enabling 60/60 real-page scenarios. No production workaround for the broken fixture.
- Verification: additional native settings tests 23/23, UI ownership regressions 22/22, selected backend regressions 47/47. Packaged arm64 bridge smoke, native menu probe, deep signature verification and archive CRC/symlink checks passed. Intel native compilation and full x64 package build passed. Both packaged native menu probes and Electron bridge smoke passed (x64 under Rosetta; initial cold-translation smoke timed out, repeat passed after translation warmup). Both ZIPs passed CRC and deep signature checks.
- No push, merge, installed-app replacement, real-agent approval or remote deployment performed.
