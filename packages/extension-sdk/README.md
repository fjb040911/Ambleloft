# @ambleloft/extension-sdk

M1 developer preview `0.1.0-alpha.1`, for Ambleloft host API `1` and manifest `1.0-draft`. This package is delivered locally as an npm tarball; it has not been published to a registry and is not stable 1.0.

## Backend

```ts
import {defineExtension} from '@ambleloft/extension-sdk';
export const {activate}=defineExtension({
  activate(context) {
    context.subscriptions.push(context.operations.register('describeProject', async (input, invocation) => {
      const project = await invocation.resources.getProject(input.projectId as string);
      return {...project};
    }));
  }
});
```

Declare the operation, exact handler name and required permissions in `extension.json`. Register handlers synchronously during `activate`; initialization work can continue asynchronously afterwards. Project resources exist only on a host-created invocation and must use its bound project. Never manufacture an invocation context. `defineExtension` is an export helper, not an activation or authorization mechanism.

Include this package in your extension's `node_modules`, or bundle it with your backend. The host uses its own Node runtime; it never installs dependencies or executes npm lifecycle scripts when loading an extension. Native modules need platform/ABI validation; this preview example uses pure JavaScript only.

## Page

```ts
import {createClient, unwrap} from '@ambleloft/extension-sdk/webview';
const client = createClient();
const host = await client.initialize();
const selected = unwrap(await client.selectProject({capabilities:['projects.read']}));
if (selected) {
  const result = await client.invoke('example.project-card.describe', {projectId:selected.id});
  if (result.ok) console.log(result.value);
  else console.log(result.error.code, result.error.effectStatus);
}
```

Bundle the browser entry into files under your declared webRoot. It uses the host bridge; ordinary browsers do not have that bridge. Await initialize before invoking. Unsupported host methods return UNSUPPORTED. Transport failure returns HOST_UNAVAILABLE; a lost operation response has effectStatus unknown. **Do not automatically retry unknown outcomes.** `unwrap` throws ExtensionError and preserves the structured failure.

Pass `{signal: controller.signal}` to invoke for cancellation. The signal remains local to the page. Cancellation means stop waiting; it does not roll back a handler. A cancelled project picker maps to `{ok:true,value:null}`; cancelled permission consent maps to `{ok:true,value:false}`. Secrets are entered through a host-owned field and are never returned to the page. There are no arbitrary IPC, file or network escape APIs.

Use `onHostContextChanged` to update language and theme and dispose subscriptions on page teardown. Do not persist pageInstanceId or treat it as a business identity.

## Storage

Declare and obtain self-scoped storage permission. `get` returns null when absent; stored JSON null remains an entry with its revision. `set(key,value,null)` creates only when currently absent, including after a delete. Numeric revisions are compare-and-set; conflicts must be resolved by the extension. Delete leaves a tombstone so revisions never reset. Keys are opaque strings of 1–200 characters. Node resource/storage rejections have an error `code`; they do not reveal remote stack traces.

The included `extension.schema.json` is for editor assistance. Host package validation also checks semantic constraints, actual files, links and permissions. The host remains authoritative even when this SDK reports success locally.

## Declarative forms and handler failures

The current host can render YAML forms discovered in registered Skill bundles. See the [form authoring guide](../../specs/extensions/declarative-forms-guide.md). This reference package remains alpha.1; it is not a declaration that the independently maintained SDK/CLI has the same version or packaging. Its local build now includes the form.schema.json export.

Form submissions include optional `invocation.form`: flowInstanceId, stepId, submissionId, templateDigest and conversationId. Ordinary operations can receive no form context. The recovery operation instead reads `input.submissionId`; it must not require invocation.form.

Throw an error with an allowlisted `code` for a public failure, for example `Object.assign(new Error('Form required'), {code: 'UNSUPPORTED'})`. The host preserves the code but does not forward arbitrary exception text, stack or details. Unknown codes become INTERNAL. The host determines effectStatus from dispatch state; a backend cannot claim notStarted or completed. Cancellation does not roll back business effects, and unknown outcomes must not be retried automatically.
