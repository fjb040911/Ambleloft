# Windows update test

This is an unsigned, isolated Windows x64 test application. Production releases
still use their existing configuration and signing gate.

- Repository: https://github.com/fjb040911/Ambleloft-update-test
- App ID: `app.ambleloft.update-test`
- Product: `Ambleloft Update Test`
- Profile: `%APPDATA%/Ambleloft Update Test`
- Updater cache: `%LOCALAPPDATA%/ambleloft-update-test-updater`
- No `ambleloft://` protocol registration.
- Logs: `%APPDATA%/Ambleloft Update Test/updates/updater.jsonl`

Build on Windows x64 with installed dependencies and a prepared, verified engine:

```powershell
npm run dist:win:update-test -- 0.0.1
```

The script retains the existing engine, runs the frontend build and native engine /
terminal checks, produces NSIS artifacts, and verifies metadata SHA-512 hashes.
It writes to `release/update-test/0.0.1`. Build B/C with `0.0.2` / `0.0.3`.
Do not rebuild or overwrite versions already published. Keep the lockfile,
dependencies, engine manifest and packaging settings fixed during this experiment.

For each version, upload the `.exe`, `.exe.blockmap`, and `latest.yml` together
to tag `v0.0.N` in the test repository. Keep prior release assets available.
Use regular published releases, not drafts or prereleases. Publish B only after
installing A, and C only after completing A to B. Do not upload source, profiles,
credentials, or logs as release assets.

Install A manually. Use the application's update controls to check, download and
restart into B, then C. Verify the running version, healthy transaction record,
engine hashes, profile path and installation path after each restart.

For each attempt record the installer size, differential plan (`Full` / `To download`),
progress byte counts, fallback messages, elapsed time, and final installed version.
Progress bytes describe update payload, not all network traffic (metadata, blockmaps,
headers, retries). Do not interpret a planned differential download as a successful
one unless it finishes and verifies without falling back.

Additional cases: interrupted network then retry; cancellation then retry; an active
terminal/task preventing installation; missing old installer cache causing a full
download. Move only the test cache's old installer aside for the last case and keep
a backup. Never manipulate the production cache or disable networking system-wide.

GitHub Actions is optional for this first local-build experiment. A workflow in the
source repository cannot use its default GITHUB_TOKEN to publish to another repo;
automating that later needs credentials scoped to the test repo or a workflow there.

## Verification on 2026-11-10

On Windows x64, A/B/C were built, published and installed from the dedicated test
repository. All three engine manifests have SHA-256
`280dabcb3f0d9f655d5c601935cdd9c653344b6fb40dd46ea28aa48c138b919f`.

| Download | Full installer bytes | Download payload bytes | Reduction |
| --- | ---: | ---: | ---: |
| A 0.0.1 → B 0.0.2 | 233,180,898 | 6,853,530 | 97.06% |
| B 0.0.2 → C 0.0.3 | 233,179,686 | 7,116,474 | 96.95% |
| Missing B installer cache → C | 233,179,686 | 233,179,686 | Full fallback |

All listed downloads completed and passed updater validation. These are payload
measurements; they exclude metadata, blockmaps, headers and previous test attempts.
Local evidence is in `release/update-test/evidence/download-summary.json`.

Verified cancellation, application-scoped network failure and retry, an active
terminal blocking installation, and cancellation of a scheduled restart. An active
Agent/API task was not separately exercised. Unit tests cover the update state
machine and the disk-preflight cancellation race; a browser test covers the bottom
left ring, hover text, single download trigger and synchronized progress.

The automation process and the installer-relaunched application were observed to
see different contents at the same AppData path. Polling the former's transaction
file therefore timed out even though the real restarted process reported version
0.0.3 with status `current`. When using process/filesystem isolation, inspect the
restarted application's own profile view before diagnosing a startup failure.
A normal-user C → D test additionally verified automatic restart, a `healthy`
transaction, and the unchanged profile continuity marker. D (0.0.4) was running
with no update error after restart. The transaction completed at
2026-11-10 17:46:36 Asia/Shanghai. Evidence:
`release/update-test/evidence/normal-user-D-after.json`.
This session also verified immediate cancellation with the disk-preflight fix.
Its initial cache lacked the old installer, so C → D used a full download;
this extra run is a restart/profile test, not another differential measurement.
The D engine manifest matches A/B/C exactly.

Validation completed: 11 targeted Node tests, one browser interaction test,
TypeScript/Vite builds, native engine/terminal packaging checks, release asset
hash/blockmap checks, and the real installer/update cases above. Source changes
are local; the test repository contains a README and public test release assets.
