# Managed repair v1 — local project preview

A skill can opt a declarative UI chat action into baseline checks and serialized repair execution. This is a generic host facility; report formats, issue IDs and review quality belong to the skill. It is not a new extension Operation, permission bypass or automatic validation verdict.

## Capability and data contract

Call `ui_capabilities` and require all of:

```json
{"managedRepair":1,"managedRepairLocalOnly":true,"managedRepairScope":"enumerated-files"}
```

Add `managedRepair: true` to the selected `kind: "chat"` actions in an `amble-ui` template. Supply a top-level `data.baseline` with `ui_present` or `ui_update`:

```json
{
  "version": 1,
  "scope": "enumerated-files",
  "refs": [
    {"kind":"report","path":"review/report.json","sha256":"<SHA256 of report bytes>"},
    {"kind":"rules","path":"review/rules.json","sha256":"<SHA256 of rules bytes>"},
    {"kind":"source","path":"src/example.ts","sha256":"<SHA256 of source bytes>"}
  ]
}
```

Hashes are 64 lowercase hexadecimal characters. Hash the actual files after saving, not parsed/re-serialized JSON or a model-generated assertion. Do not embed a report's own byte hash in that report. There must be 3–256 distinct refs, including at least one of each kind. The host rejects unsafe relative paths, case/Unicode aliases, symbolic links and hardlinks, and reads at most 8 MiB per file / 64 MiB per baseline. The public JSON Schema defines shape; the host also verifies filesystem semantics and bytes.

Use `data.coverage` to state which files were reviewed. The first version only covers **enumerated files**: deletion or modification invalidates the baseline; newly created unlisted files are not detected. Do not label a partial list as whole-project coverage. SSH and Docker projects reject managed repair with `UNSUPPORTED`; ordinary non-managed UI actions remain available.

## Execution and user-visible state

At presentation the host binds the real chat, project ID, configured project path and canonical local root. A renderer, skill or report cannot replace those identities. The host verifies again at click and immediately before sending to the model. Any report, rules or source change rejects the action with `MANAGED_REPAIR_CONFLICT`; obtain a new report and a new UI instance instead of retrying stale data.

An identical action on the same UI snapshot reuses its prior frozen submission. Different chats sharing the same canonical project root share a persistent lease in this host profile. The lease lasts until the corresponding model turn terminates, including post-turn runtime work. Managed actions wait for an idle chat; they never steer an unrelated active turn. Other projects may run concurrently.

`ui_read_submission` returns the frozen data and a separate `repairExecution`:

```json
{"deliveryStatus":"delivered","status":"executing","error":null,"scope":"enumerated-files"}
```

The UI list projects `repairStatus`, `held` and `error` on each submission. Delivery and repair state must not be conflated:

| Repair status | Meaning |
| --- | --- |
| queued | Waiting for explicit resume, an idle chat or the project lease |
| executing | The host reserved execution; delivery may still be preparing |
| finished | The associated model turn ended normally; actual changes still need review |
| conflict | Baseline changed before sending; no repair dispatched |
| failed | Pre-execution failure; inspect the error |
| reviewRequired | Prior execution or its outcome is uncertain; re-review first |
| reviewed | A new explicitly requested repair is linked to a new review of this execution |

A normal model response is never proof that issues were fixed, tests passed or business state changed. The skill must inspect the actual files and evidence, publish a new review, and distinguish unresolved findings from verified results.

## Pause, restart and uncertain execution

Pause prevents queued dispatch. Restart holds queued managed actions for explicit continuation, and quarantines existing leases as `reviewRequired`; it never releases them just because their process is absent. Interrupted/failed model turns also retain their uncertain lease. A prior queued item cannot blindly clear this state.

To continue after inspection, create a **new** report and baseline with optional `reviewOf` equal to the previous frozen submission ID. The report bytes must change, the whole new baseline must verify, and the old chat must have no active context or active status. Then a fresh user click can replace the quarantined lease. Moving/copying/reordering unchanged report refs is insufficient. This provides linkage and byte evidence; it cannot prove that an AI performed a good review.

This serializes opted-in repairs inside one host profile. It does not lock external editors, shells, ordinary model turns, other profiles, or remote hosts. External edits are caught by the pre-dispatch check where observable; no OS-level atomic file transaction or rollback is claimed.

## Validation

`node --test tests/managed-repair.test.cjs tests/chat-inputs.test.cjs tests/declarative-ui.test.cjs` covers real SQLite persistence, frozen submissions, same-instance deduplication, cross-chat lease lifecycle, pre-dispatch conflicts, restart quarantine, explicit re-review recovery and ordinary input regressions. Model dispatch is a test double; these tests do not claim a live model successfully repaired source code.
