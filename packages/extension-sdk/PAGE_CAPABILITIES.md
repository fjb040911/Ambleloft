# Host page capabilities / 宿主页面能力

These APIs belong to the Ambleloft host, accessed from an extension page through `@ambleloft/extension-sdk/webview`. They do not require an extension backend operation. This is the API 1 developer preview: discover methods at runtime rather than inferring support from the SDK package version.

这些是宿主提供给扩展页面的通用能力，不是私有扩展业务接口。存储必须经过权限声明与授权；复制、导出必须由宿主原生对话框确认，不能绕过用户交互。

## Initialize and discover

```js
import {createClient, unwrap} from '@ambleloft/extension-sdk/webview';

const client = createClient();
let host = await client.initialize();
const supports = method => host.supportedMethods.includes(method);
const subscription = client.onHostContextChanged(context => { host = context; });
// Call subscription.dispose() when the page is torn down.
```

Bundle this code into the extension's declared `contributes.home.webRoot` and `entry`. It runs inside a trusted, enabled extension page, not an ordinary browser. Await `initialize()` first; creation/initialization can throw `ExtensionError` if the bridge is unavailable or incompatible. Later calls return `{ok:true,value}` or `{ok:false,error}`. `unwrap` throws on a failed result. An advertised method is available in the protocol; it does **not** prove the extension has permission to use it.

## Methods and boundaries

| Method | Input | Success value | Authorization and limits |
| --- | --- | --- | --- |
| `getStorage` | `{key}` | `{value,revision}` or `null` when absent | Declared and granted `storage`, scope `self`; own extension KV only |
| `setStorage` | `{key,value,expectedRevision}` | `{revision}` | Same grant; JSON values; compare-and-set required |
| `writeClipboard` | `{text}` | `{copied:boolean}` | Host confirmation for each call; write-only clipboard; no clipboard read |
| `saveTextFile` | `{suggestedName,text}` | `{saved:boolean}` | Host save dialog for each call; page cannot choose an absolute path or learn the selected path |

The page cannot supply an extension ID, storage kind, resource scope or permission override for storage. Keys are opaque strings of 1–200 characters. Data is scoped to the extension identity, **not** automatically to the current project or page. Use application-level key conventions if needed. KV storage is not encrypted secret storage: use `requestSecretInput` and the separate `secrets` permission for credentials; that API does not return the secret to the page.

Storage declarations use this fragment inside `extension.json` (not a complete manifest):

```json
{"permissions":[{"capability":"storage","scope":"self"}]}
```

Declaration alone does not grant access. Have the user authorize storage in the host's extension permissions UI. `getStorage`/`setStorage` do not open a consent dialog or grant access automatically. They return `FORBIDDEN` without a current grant. These APIs do not require a selected project. `requestGrant` is tied to the existing project-selection interaction; it is not a standalone self-storage consent shortcut.

Copy and text export currently have no separate manifest capability or persistent grant. Instead, the host validates the active page and mediates every request with its own native dialog. Invoke them from an explicit user action, not a background loop. Neither API grants general filesystem access, network access, shell execution or permission to read files.

## Save and load a draft

```js
const key = 'draft:notes';
let revision = null;

async function loadDraft() {
  if (!supports('getStorage')) return {unsupported: true};
  const entry = unwrap(await client.getStorage({key}));
  revision = entry?.revision ?? null;
  return {value: entry === null ? {text: ''} : entry.value};
}

async function saveDraft(text) {
  if (!supports('setStorage')) return {unsupported: true};
  const result = await client.setStorage({
    key, value: {text}, expectedRevision: revision,
  });
  if (result.ok) {
    revision = result.value.revision;
    return {saved: true};
  }
  // Keep the editor's text. Show a conflict/reconciliation action instead of
  // changing the revision and silently overwriting another page's update.
  return {saved: false, error: result.error};
}
```

`expectedRevision:null` creates only if the key is absent. A positive revision updates only that exact version. Read before editing an existing value. `CONFLICT` requires rereading and explicit merge/overwrite decisions; do not automatically substitute the newest revision. After an unknown write outcome, read back and reconcile before offering a retry.

`value:null` stores JSON null; it does **not** delete the entry. `getStorage` then returns `{value:null,revision:...}`, distinct from a missing key's `null`. The page API exposes no delete method. Backend storage deletion has different semantics; do not copy backend deletion examples into page code.

Only JSON data is accepted (no undefined, functions, non-finite numbers or custom objects). The complete storage RPC envelope is limited to 256 KiB, so payloads must leave room for keys and metadata. Persisted values also have a 256 KiB limit. Host storage enforces 10,000 entries and 10 MiB per extension across its storage kinds, including tombstones; it is not a large-file store.

## Copy or export text

```js
async function copyText(text) {
  if (!supports('writeClipboard')) return {unsupported: true};
  const result = await client.writeClipboard({text});
  if (!result.ok) return {error: result.error};
  return {copied: result.value.copied}; // false: user declined; do not retry
}

async function exportNotes(text) {
  if (!supports('saveTextFile')) return {unsupported: true};
  const result = await client.saveTextFile({suggestedName: 'notes.md', text});
  if (!result.ok) return {error: result.error};
  return {saved: result.value.saved}; // false: save dialog cancelled
}
// Wire these functions to the page's Copy and Export buttons.
```

`text` must be a string of at most 1 MiB in UTF-8 bytes (not JavaScript character count). The full export RPC envelope must also fit within 2 MiB. `suggestedName` must be at most 180 characters, contain no `/`, `\\` or control characters, and end in `.md` or `.txt` (case-insensitive). It is only a suggested filename; the user chooses the destination in the host dialog. The filename restriction is checked on the suggestion, not a promise that the OS dialog prevents every user-selected filename change.

Only one copy/export interaction can be pending per page (`BUSY` otherwise). Successful copy/export returns only a boolean, never a filesystem path or clipboard contents. Cancelling the native dialog normally returns success with `copied:false` or `saved:false`; page invalidation is a failure, not equivalent to user cancellation.

## Errors, lifecycle and retries

- `UNSUPPORTED`: method absent on this host; disable the action or explain that a host update is needed.
- `FORBIDDEN`: missing/revoked permission, disabled/untrusted extension or invalid active revision. Return control to the host permission/extension UI.
- `CONFLICT`: storage revision changed; preserve the draft and reconcile.
- `INVALID_ARGUMENT` / `QUOTA_EXCEEDED`: fix the input or reduce stored data; do not retry unchanged.
- `BUSY`: another interaction or the page's 16-request limit is active; avoid duplicate clicks.
- `CANCELLED`: page closed or its generation changed while work was pending. A stale confirmation must not authorize a new page/revision.
- `STORAGE_UNAVAILABLE`: export could not be written. Explain failure without claiming a file was saved.
- `HOST_UNAVAILABLE`: bridge/transport failed. For writes, copy and export, a lost response has `effectStatus:'unknown'`.

Always inspect `error.effectStatus` as well as `error.code`. `notStarted` means the host did not dispatch the effect; `unknown` means an effect may already have happened. Do not automatically retry unknown outcomes or claim cancellation rolled them back. The four APIs above do not accept an `AbortSignal`; the signal option documented for `invoke` does not apply to them.

## Related host changes

Workbench layout is host-owned; extensions need no API call to benefit. Summary formats (`general`, `work`, `learning`, default `work`) belong to the separate project-insights summary service, not these four page bridge methods. Do not pass a `format` field to storage or export calls; the SDK's published project-insights types remain the reference for that preview surface.

### Summary format example (extension backend)

Use the real activation context supplied by the host, not the page client or a fabricated context. The manifest must declare project-scoped `project.summaries.generate`, `conversations.read` and `background.jobs`; the user must grant them for the project and enable its host-managed model policy. Reading activity references separately requires `project.activity.read`. SDK availability checks do not grant these permissions or enable model usage.

```js
import {getProjectInsights} from '@ambleloft/extension-sdk/project-insights-preview';

async function prepareLearningNotes(context, projectId, turns, requestKey) {
  const insights = getProjectInsights(context);
  const policy = await insights.summaries.policy(projectId);
  if (policy.paused || !policy.providerId || !policy.model) {
    throw new Error('Enable the project summary model policy in the host first.');
  }
  return insights.summaries.prepare({
    projectId,
    turns, // 1–100 actual {conversationId, turnId, version} source references
    requestKey, // persist one key per logical request; reuse for reconciliation
    ruleVersion: 'learning-notes-v1',
    format: 'learning',
    language: 'en',
    modelRef: {providerId: policy.providerId, model: policy.model},
  });
}
```

`general` organizes topics, decisions and next steps; `work` organizes progress, deliverables and blockers; `learning` organizes concepts, understanding, examples and open questions. Format affects the summary cache identity. Reusing the same request key with changed input is not a new request. Read `summaries.get(id)` to reconcile job state; receiving a job does not mean generation succeeded. Results may be partial, failed, unknown or cancelled. Generated items are reported evidence, not independently verified facts. The host checks source versions, project access, model policy and limits; this API does not expose raw source messages or allow callers to bypass policy. Do not automatically retry an unknown generation outcome.
