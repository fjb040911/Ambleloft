# Extension home page and secure credential setup

Read this when a generated extension needs its own page. This is a generic host bridge, not a business example.

Declare `contributes.home.webRoot` as a directory relative to the extension root and `contributes.home.entry` as its HTML entry (for example `{"title":"Service","webRoot":"web","entry":"index.html"}`). Use local module scripts; package referenced JS/CSS in the archive. The page is an isolated browser surface: no Node APIs, no direct access to the configuration store or secret values. Use declared operations for business work.

Enabled, trusted extensions with `contributes.home` appear as business entries under the host's Extensions activity icon. One extension contributes one home page; use `home.title` (localized when appropriate) as its business-facing label. Skills and extensions without a home remain in Skills & extensions and chat. Do not generate an empty page merely to get a sidebar entry.

The business page's menu opens the existing Settings & permissions or Details in an overlay; closing it keeps that page instance alive. Leaving for a different business or the management center may destroy the page, so explicitly persist drafts through declared backend storage operations. Never submit a mutation automatically when opening or restoring a page.

The host's **entry project** only controls `home.when`. It is not the business operation's bound project, and HostContext does not expose a project. Use `client.selectProject` with declared capabilities and explicit host consent, then pass that project ID to project-scoped operations. Configuration saved, permissions granted, and service connection verified are separate states; show the true state and recovery action.

If `@ambleloft/extension-sdk` is installed, import `createClient` and `unwrap` from `@ambleloft/extension-sdk/webview` in your bundler. With no bundler, copy the bundled [webview-client.mjs](webview-client.mjs) into the generated page directory and import it with `./webview-client.mjs`. It is the host SDK adapter, not an example application. Include it in the package; do not rely on a CDN or invent a global client.

```js
import {createClient, unwrap} from './webview-client.mjs';
const client = createClient();
const host = await client.initialize();
// Inspect host.supportedMethods before optional APIs. Initialize before any call.

// Only in a user click handler; key must match context.secrets.get in the backend.
async function configureCredential() {
  const result = unwrap(await client.requestSecretInput({
    key: 'serviceToken', title: 'Business service credential'
  }));
  // saved=false means cancellation; it is not a connection failure.
  if (result.saved) status.textContent = 'Credential saved. Check the connection next.';
}

// Use a real operation ID declared by this package with exposeTo including page.
async function readConnection() {
  const result = await client.invoke('YOUR_DECLARED_READ_OPERATION_ID', {});
  if (!result.ok) {
    status.textContent = result.error.message;
    return;
  }
  // Validate the business response before rendering; use textContent for text.
}
```

Declare the `secrets` permission with scope `self` when using credential storage. Respect host grants. For non-secret connection addresses/paths, declare `configuration` and its schema; direct the user to the host settings page, and read `context.configuration.get()` in the backend. Do not collect credentials in ordinary page text fields, pass them through operations, print them in errors, or put them into chat.

`initialize()` throws on failure. Other methods return `Result`; `unwrap` throws an `ExtensionError`. Catch and display recoverable errors, preserve drafts, and leave the settings action available. Cancellation is not successful setup. A saved credential is not proof that the service accepted it.

For business mutations, keep a stable operation ID with the pending draft. On timeout or an unknown outcome, query that ID before any retry. Scope saved snapshots and drafts to the verified service identity; clear visible data when changing accounts. The host prompt authorizes an operation; only its actual response proves business progress.
