# Windows stability preview validation — 2026-11-19

This preview contains the Windows file-access, lifecycle, draft recovery, storage and streaming fixes developed against main `f9ea0c35f517d6cec328873dd3f428d9cc8f8dda`. Version 0.9.13 packages these changes for wider Windows client testing.

## Changes

- Preserve path containment, symlink and replacement checks for Windows file operations.
- Persist conversation drafts and delivery receipts, and restore reading position and expanded state after reload.
- Separate discussion status queries from full-body retrieval and instrument completion storage costs.
- Close owned Windows engine process trees before temporary directory cleanup; cover EBUSY regressions.
- Bound and reuse private text-spool read handles using iterator leases and file identity checks. A 100 Hz reproduction previously spent 28.42 of 30.13 sampled seconds in synchronous open operations.
- Serialize small SSE events in one write while retaining bounded packets and downstream backpressure for large final responses.
- Strengthen test verdicts with terminal status, actual model routing, body hashes, process exit and restart checks. Correct Windows fixture pacing and PID-reuse attribution in process sampling.

## Observed validation before the version-only release rebuild

Windows 11 build 26200; i5-12450H; 15.78 GiB RAM; Electron 41.10.7; bundled Codex 0.166.0.

- Node: 1,184 tests, 1,180 passed, four skipped, zero failed. Skips require Linux/POSIX or private publisher fixtures.
- Selected browser regressions: 109 passed, including drafts, reload, discussion and attachment paste fixtures.
- TypeScript and production frontend build passed.
- 32 MiB active-text benchmark and native Electron delivery probe passed.
- Final isolated installed-binary run: 622,905 ms (10.38 minutes); sustained streams 99.98–100 Hz; 10 tasks, four discussions and eight experts; 46 message fields preserved across restart; cold startup loaded no full-body cache entries; both application exits returned zero.
- Page-query latency p95 29.63 ms, maximum 963.97 ms. Main-process RSS peaked at 560.90 MiB and ended at 261.22 MiB. These short-run values do not establish freedom from memory leaks.
- Installed-binary DeepSeek validation passed actual tool read/write, contextual follow-up, upstream completion, redaction checks and restart hashes.
- Isolated NSIS installation and uninstallation passed; no owned test processes remained; profile contents and the pre-install protocol association were preserved.

Raw logs, diagnostics, profiles and encrypted model configuration stay local under `output/windows-extreme-20261119/`; they are deliberately excluded from Git and release assets. The local HTML report preserves failed intermediate experiments as well as successful runs.

## Known limits and client test focus

- About 43 seconds elapsed between the last model output and all tasks reaching completion. The remaining end-to-end drain cost has not been fully attributed and must not be equated with a single database save.
- No white screen reproduced in the final covered scenarios; this is not proof that all white-screen causes are eliminated.
- The final fixes have not completed another 120-minute soak. Earlier 120.34/120.95-minute runs belong to an earlier source snapshot.
- A direct local I/O error can still appear as generic `upstream_stream` diagnostics because the direct error code is not always retained.
- Only one real model was tested; switching to a second model used a distinguishable synthetic service.
- The preview is unsigned. Formal signing, SmartScreen reputation, macOS validation and all upgrade/permission/network combinations are not covered.

Client testers should report version, OS, operation sequence, task/request ID, time and sanitized diagnostics for white screens, long completion delays, stop/continue failures or draft recovery errors. Do not include API keys or private task bodies.
