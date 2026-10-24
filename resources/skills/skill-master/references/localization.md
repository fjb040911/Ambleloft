# Multilingual skills and extensions

Use this when the user needs more than one UI language. Single-language plain text remains valid. Keep business IDs, option values, payloads and user/server content unchanged.

- Extension display strings in `extension.json` use whole-value `%key%` references. Put a complete flat string dictionary in `extension.nls.json`, with optional `extension.nls.en.json` / `extension.nls.zh-Hans.json` overrides at the package root. This covers displayName, description, operation title/description and configuration descriptions supported by the manifest.
- Each skill has its **own** `skill.nls.json` and locale overrides beside `SKILL.md`. Use optional `displayName: "%name%"` and `displayDescription: "%description%"` in frontmatter. Do not translate `name` or the discovery `description` via display placeholders.
- The skill dictionaries also cover referenced form titles/descriptions, step titles/descriptions, field label/help/placeholder, option labels and submit labels. They do not inherit the extension dictionary. Keep template IDs, field names, operation IDs, bindings and select values stable.
- Default dictionaries must contain every referenced key. Values are plain text, no HTML or nested translation expansion. Translate complete strings, not fragments. Static labels must not need dynamic parameters. Validate through the target host; capability names include `skillLocalization`, `templateLocalization`, `liveLocalization`.

Example: `label: "%ticket.problem%"` in the form, with `{"ticket.problem":"问题说明"}` in `skill.nls.json` and `{"ticket.problem":"Problem description"}` in `skill.nls.en.json`.

For a custom home page, the host does **not** translate DOM content. Read the effective `locale` and `theme` from `await client.initialize()` and subscribe with `client.onHostContextChanged(...)`. Package page dictionaries locally (e.g. a JS module) and update visible labels without resetting drafts, selection, request IDs or business snapshots. Use `textContent` for translated text. Never resubmit or recreate a form when the language changes. Dispose subscriptions when the page is unloaded.

Backend display errors can use the extension dictionary through `context.l10n.t(key,args)` and the operation invocation locale supported by the contracts. Raw business content remains raw. If the initial output localizes only static labels and still has untranslated business/error prose, say so rather than claiming complete bilingual coverage.

Verify both languages, missing-key diagnostics, narrow layout and unchanged payload identities. A language switch must never clear an unknown submission or change its identity.
