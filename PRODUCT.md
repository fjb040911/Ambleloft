# Ambleloft

<!-- impeccable:product-schema 1 -->

## Current implementation and evidence override (2026-11-03)

This section supersedes historical “design only” status statements below, while preserving the decisions and their evidence boundaries. Product positioning remains a foundation for software companies building business Agents. The collaboration workbench organizes how those Agents are planned, built and reviewed; Skills, declarative UI and extensions provide their business-facing capabilities.

- Curated roles with default fixed skills, automatic preparation, personal-choice preservation and task snapshots are implemented. The [2026-10-27 record](specs/workforce/implementation-2026-10-27.md) documents test Store publication and real installation of ten roles’ skill combinations. This is not proof of current installer coverage, all external tools or every role’s output quality.
- Current expert creation uses **Define role → Configure skills → Confirm configuration**. Custom roles enter these steps directly; the earlier AI-assisted brainstorming page is no longer the entry flow. Filled template steps are directly accessible. Existing experts use single-page incremental editing; see [editing rules](specs/workforce/expert-editing-2026-11-01.md) and `src/WorkforceRoleEditor.tsx`.
- Project spaces logically associate existing projects. [Host-led discussions](specs/workforce/discussion-host-2026-11-01.md) clarify goals, coordinate actual experts and preserve source references. The recorded real-model trial verifies sequential specialist analysis, not complete remote delivery. Saving a plan and authorizing execution remain distinct.
- The [read-only dependency graph](specs/workforce/plan-graph-delivery-2026-11-02.md) is implemented. Current working-tree UI uses the graph as the plan workspace and opens a node work page; the older list/graph toggle is not the current tutorial path. Actual dependencies, valid acceptance and stale references govern scheduling. Graph gestures do not modify the plan.
- Historical knowledge means scoped retrieval of authorized sources through the current source-memory provider. Do not claim all-project autonomous memory or imply that Hindsight/Mem0 is deployed.
- [Native Codex subagents](specs/analysis/read-only-assistants-2026-11-03.md) are temporary task delegates, separate from reusable experts. Current integration has real-engine tests with controlled local model responses; this does not establish real-model task quality or Windows, SSH/Docker and installer validation.

The primary collaboration example is now one developer maintaining the host, SDK, samples, an SSH-connected extension service, website and guides. Emphasize specialist partners working together around a centrally stated goal. The reviewed sequence is shared goal/contract → accepted host implementation → independent SDK/service/website branches → sample after SDK and service acceptance → guide after sample acceptance → integration and delivery review. Dependencies must be saved explicitly. Runtime handoff provides bounded direct-predecessor summaries, acceptance records and pinned references; it is not automatic repository synchronization, artifact copying or package publication. The older repair-ticket example remains a business-form exercise rather than the main collaboration story.

Public materials must distinguish current source, recorded isolated tests, recorded real integrations and distributed installers. The current source includes unpublished working-tree changes. Use release notes for download coverage. The curated test Store is not an open community publishing platform; site content must not promise current availability without checking the host’s trusted catalog. No public SDK API is added by describing these host workflows.

### Video direction override (2026-11-03)

All product films, including the multi-project collaboration film and the earlier business-integration film, are **product vision / concept demonstrations**. They may portray ideal future experiences beyond current implementation, including richer context/artifact handoff and automated verification. Label them accordingly: “Concept demonstration; some experiences are planned.” Do not treat video scenes as current feature or deployment acceptance evidence. Current-source tutorials, API contracts and verification records remain factual and keep their existing dependency and permission rules. Isolated UI screenshots retain their own fixture captions and are not relabeled as live execution recordings.

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
