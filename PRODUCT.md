# Ambleloft

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop application with a React interface. Existing project components and tokens remain authoritative.

## Users and purpose

Software companies and developers building business Agents on top of existing systems. End users can invoke developer-defined skills and forms through conversation; extensions connect to business services, tools, devices and custom interfaces.

## Confirmed collaboration requirements

Users define reusable AI employees, responsibilities and skills. A logical project space associates existing projects without requiring a shared disk directory. Discussion, delivery and task status must be visible and traceable. Roles declare skills; the target design prepares missing skills automatically when an employee creation/edit is submitted, reusing the shared global library. All selected skills, including imported sources, must be ready before the new employee configuration becomes effective. This supersedes the older separate save/activate flow; it is a design requirement, not a claim that the current code implements it. Editing a role does not uninstall shared skills. A role grants no extra tool or project permissions.

## Product principles

Keep entry points consistent. Prefer progressive guidance to long up-front forms. Explain failures and recovery. Distinguish implemented capabilities, test evidence and product vision. Preserve the approved Figma-inspired workbench and existing shadcn/Base UI components.

## Requirements and decision history

Read `../agent-flow/designs/agent-workforce/decision-log.md` and `requirements.md` before modifying collaboration features. The objective is a reusable AI team driving existing projects from discussion through shared decisions, dependent implementation, evidence-based acceptance and authorized historical knowledge reuse. Role management is only the foundation. Later explicit user decisions override old proposals: use a dedicated collaboration ActiveBar entry, put custom-role creation in the role library, and keep skills as declarations prepared in the shared global library. Never rewrite requirements to match a reduced implementation. The current business gaps and verification levels are recorded in `specs/workforce/business-audit-2026-10-25.md`.

## Evidence and scope

The approved interaction reference is `../agent-flow/designs/agent-workforce/interaction-v3.md`, with its running v0.3 prototype and screenshots as the visual acceptance baseline. Preserve the cream role-library hero, pastel two-column role/employee cards, skill labels, search and guided steps. Shared host navigation is retained as explicitly requested; it is not a reason to flatten the approved page design. Record outstanding prototype-to-implementation differences explicitly before calling a feature complete. Persistent collaboration, memory integration and multi-project orchestration are staged work; a prototype animation is never evidence of a live model run or installation.

## Role skills: latest design baseline (2026-10-26)

Read `specs/workforce/role-skills-product-v1.md`, `role-skills-architecture-v1.md`, and `role-skills-delivery-checklist.md` before changing role recommendations, employee editing, Store APIs or skill preparation. Official roles map to curated skills with role-specific recommendation reasons. GitHub discovery/classification belongs to the Store publishing pipeline; employee/project data stays local. The selector does not distinguish locally installed skills: selection means the employee will use that skill. Keep import-source entry points. Submission shows genuine preparation progress, preserves the prior effective configuration on failure, and never changes in-flight task snapshots. Merely viewing or opening edit does not create a modification draft; only meaningful content differences do. Older documentation of installed-skill tabs, exposed internal source IDs, and separate save/activate actions is superseded for this flow. These are documentation-only target requirements until the delivery checklist has implementation evidence.

## Expert role catalog and language contract (2026-10-26)

The catalog baseline is `specs/workforce/expert-role-catalog-v1.md`, with ten bilingual authoring examples under `specs/workforce/examples/expert-roles.authoring.json`. Define responsibilities, inputs, deliverables with acceptance criteria, methods, boundaries and exact skill bindings. Copywriting and technical documentation are separate roles; Web UI design and frontend implementation are separate roles. New canonical content uses `zh-CN/en`; API locale projection, fallback metadata, pagination and caching must follow the contract. UI language changes never rewrite employee definitions or install different packages. Authoring capability plans are unresolved design data, not installable Store entries. Preserve existing role IDs and employee versions. This update is documentation only.

## Read-only collaboration plan graph (2026-10-26)

The user approved a viewing-only first version, specified in `specs/workforce/plan-graph-view-v1.md`. Add a list/graph switch within each collaboration plan, a graph entry from the space overview, and an unsaved dependency preview in the existing plan editor. Show business work packages and dependencies with real host status, blocking reasons and existing task-detail navigation. Support zoom, pan and dependency highlighting while keeping layout and viewport stable during status updates. Do not add node/edge editing or change scheduling, acceptance, permissions or plan data through graph gestures. Completed plans remain viewable. This is an approved design, not an implemented feature.

## Curated default role skills (2026-10-27)

The value of an official role is professional skill selection for non-expert users, together with its responsibilities and working methods. This explicitly supersedes the earlier no-preselection rule: official expert templates provide a verified default skill combination, preselected when creating an employee. Users can keep it without choosing skills individually, or remove, replace and add skills. Submission automatically prepares the selected fixed artifacts before atomically applying the employee configuration. Browsing does not install; editing, copying, restoring drafts, changing UI language or refreshing recommendations never reapplies template defaults over personal choices. Tasks automatically receive the employee's fixed skills and should read and follow applicable skills without the user naming them. Verification must distinguish installed, actually loaded and demonstrated use in task results. Unresolved authoring plans remain non-installable; concrete artifacts and representative task evidence are still required before publishing the ten official roles. See ARCH-10 and AC-35–AC-38. This amendment changes design documents only, not the running application or Store.

The concrete proposal is now in `specs/workforce/expert-role-skills-recommendations-v1.md` and `examples/expert-role-skills.recommendations.json`: 40 source-pinned candidates from 11 repositories, 30 default and 13 optional role bindings. These are researched candidates, not built or published packages. `role-skills-api-v1.md` and `examples/role-skills-api.contract.ts` define server-owned defaults, role-specific usage, provenance and verification summaries; AC-39–AC-41 cover the added contract. Do not publish the proposal JSON as the public role catalog.
