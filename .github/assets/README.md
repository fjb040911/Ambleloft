# README screenshots

Run `node scripts/capture-readme.mjs` from the repository root with dependencies and Google Chrome installed. The script starts an isolated Vite server on port 5188, renders the real application with a synthetic desktop bridge, and captures workspace, file-change, provider, and travel-expense form views in English and Simplified Chinese. It does not read user profiles, call model services, or edit real project files.

The fixtures illustrate UI capabilities, not evidence of a live agent run. Update both language sets when the interface changes. PNG files in this directory are documentation assets, not application runtime assets.

The travel-expense screenshots use a two-step synthetic template rendered by TaskForms: trip details followed by expenses. They show step 1 with prefilled sample values. This differs from the simpler single-step importable travel Skill; neither fixture demonstrates a real reimbursement submission. Form labels are localized by the fixture; host controls use the application translations.
