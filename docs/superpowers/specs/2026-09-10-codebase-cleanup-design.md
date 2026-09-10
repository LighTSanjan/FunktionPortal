# Codebase Cleanup Design

## Goal

Reduce the repository to the code needed by the portal today, without changing its working treasury flows or altering persisted data.

## Scope

The cleanup will:

- delete unused production scaffolding: the generic Recharts kit, event bus, notification delivery and inbox code with no producer, organisation mutations, and unused coach-claim barrel;
- remove the now-unused `recharts` and `resend` dependencies;
- replace the import-time module/permission registry and per-organisation enablement checks with static navigation and role permissions;
- simplify the sidebar and related navigation components around the flat navigation the product actually exposes;
- remove speculative request exemptions and upload configuration for routes and uploads that do not exist;
- remove unused imports, parameters, exports, divider comments, historical incident narratives, and comments that restate the code;
- remove the untracked Claude launch configuration;
- correct README and implementation-plan claims that no longer match the code.

## Safety boundaries

- Preserve the dashboard's rendered visualisations, including `SpendRing`, fund cards/bars, counters, and transaction views. Only `src/core/ui/charts`, which has no production importer, is removable.
- Preserve current routes, server actions, document generation, authentication, access requests, audit logging, database access, and RLS enforcement.
- Preserve Prisma models, migrations, seed data, Supabase services, deployment/RLS scripts, official templates, and source artwork. Removing database tables requires a separate data-aware migration.
- Preserve comments that explain financial rules, security boundaries, timezone/date handling, document semantics, or unavoidable platform workarounds.
- Do not revert or overwrite pre-existing uncommitted work.

## Architecture after cleanup

Permissions become a static map from permission key to allowed organisation roles. Navigation becomes a static list filtered through that permission map. `getOrgContext` returns organisation and membership only; it no longer queries `OrganisationModule` on every request. This removes import-order state, lifecycle hooks, dependency graphs, and database reads that have no current product use.

The shell keeps its desktop collapse control, mobile navigation, command palette, organisation logo, and user menu. Nested navigation, module badges, storage quotas, speculative notifications, and legacy icon mappings are removed.

## Verification

The cleanup is acceptable only if TypeScript, ESLint, unit tests, and the production Next.js build all succeed. A production import-reachability scan must show no newly orphaned application modules. Documentation must distinguish implemented work from schema-only preparation.

## Plan status after audit

Implemented: the core coach-claim flow, attendance CSV import, reference allocation, authentication/access requests, dashboard, register import/read view, opening balances, and trimester dates.

Still open: self-practice sessions; signature upload/stamping; invitations and revocation; fee collection and deposit forms; reminders, Telegram, and cron; procurement and PRF/PAF generation; register diff/approval/snapshot/write-back; FY2027 handover; the Student Claim Form decision; spend history; missing historical references; re-raising voided months; instructor photos; and production auth email configuration.
