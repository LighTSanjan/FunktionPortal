# Codebase Cleanup Implementation Plan

**Goal:** Remove unused scaffolding and simplify navigation, permissions, comments, and documentation without changing current product behavior or database state.

**Architecture:** Use static role permissions and static flat navigation instead of mutable import-time registries and organisation-module lookups. Delete only files with no production import path, while retaining all rendered dashboard visualisations and live Supabase/RLS infrastructure.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, Supabase, Vitest, ESLint

**Spec:** `docs/superpowers/specs/2026-09-10-codebase-cleanup-design.md`

## Global Constraints

- Do not change Prisma models, migrations, seed data, RLS policies, deployment scripts, official templates, or source artwork.
- Preserve all current routes, actions, authentication, access checks, document outputs, dashboard visualisations, and organisation branding.
- Delete `src/core/ui/charts` only because it has no production imports; keep dashboard-local visual components.
- Keep comments that explain financial, security, date/time, document, or platform correctness.
- Preserve all pre-existing uncommitted changes.

---

### Task 1: Remove unreachable application packages

**Files:**
- Delete: `src/core/events/index.ts`
- Delete: `src/core/events/__tests__/events.test.ts`
- Delete: `src/core/ui/charts/**`
- Delete: `src/core/notifications/index.ts`
- Delete: `src/core/notifications/composite-adapter.ts`
- Delete: `src/core/notifications/email-adapter.ts`
- Delete: `src/core/notifications/email-templates.ts`
- Delete: `src/core/notifications/actions.ts`
- Delete: `src/core/notifications/queries.ts`
- Delete: `src/core/notifications/__tests__/notifications.test.ts`
- Delete: `src/core/org/mutations.ts`
- Delete: `src/modules/coach-claim/index.ts`
- Modify: `src/modules/coach-claim/rates.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the current production import graph.
- Produces: the same reachable application with no `recharts` or `resend` dependency.

- [x] Delete the unreachable files listed above and the unused `distinctRates()` export.
- [x] Run `npm uninstall recharts resend` to update both package manifests.
- [x] Run `npm run test:run` and expect every remaining test to pass.

### Task 2: Replace the module registry with static permissions and navigation

**Files:**
- Delete: `src/core/modules/index.ts`
- Delete: `src/core/modules/__tests__/modules.test.ts`
- Delete: `src/core/permissions/kernel.ts`
- Delete: `src/modules/platform/module.ts`
- Delete: `src/modules/coach-claim/module.ts`
- Delete: `src/modules/references/module.ts`
- Rewrite: `src/core/permissions/index.ts`
- Rewrite: `src/modules/register.ts`
- Modify: `src/core/auth/dal.ts`
- Modify: `src/app/(dashboard)/[orgSlug]/layout.tsx`
- Modify: every current `hasPermission` and `getOrgContext` consumer
- Rewrite: `src/modules/__tests__/registration.test.ts`
- Rewrite: `src/core/permissions/__tests__/permissions.test.ts`

**Interfaces:**
- Produces: `hasPermission(role: OrgRole, key: Permission): boolean`.
- Produces: `resolveNav(role: OrgRole): NavEntry[]` and the serialisable `NavEntry` type.
- Produces: `OrgContext` containing only `org` and `membership`.

- [x] Write permission tests for EXCO, MEMBER, and unknown permission keys against the static API.
- [x] Write navigation tests proving EXCO and MEMBER receive the expected flat entries.
- [x] Replace registry code with the static permission and navigation implementations.
- [x] Remove `OrganisationModule` reads and `enabledModules` propagation from the DAL and consumers.
- [x] Run the permission/navigation tests, then the full unit suite.

### Task 3: Simplify the application shell

**Files:**
- Rewrite: `src/core/ui/shell/app-sidebar.tsx`
- Modify: `src/core/ui/shell/app-shell.tsx`
- Modify: `src/core/ui/shell/mobile-nav.tsx`
- Modify: `src/core/ui/shell/command-palette.tsx`
- Modify: `src/core/ui/shell/app-header.tsx`
- Delete: `src/core/ui/shell/notification-panel.tsx`
- Modify: `src/core/ui/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: flat `NavEntry[]` from `src/modules/register.ts`.
- Preserves: desktop collapse state, active links, mobile menu, command palette, organisation logo, settings access, and user menu.

- [x] Remove nested-item, badge, storage-quota, version, notification, and unused-icon branches.
- [x] Keep the current shell behavior with a single flat navigation renderer.
- [x] Update shell tests for the reduced prop surface.
- [x] Run shell tests and the full unit suite.

### Task 4: Remove speculative configuration and comment noise

**Files:**
- Modify: `next.config.ts`
- Modify: `src/proxy.ts`
- Modify: `src/proxy.test.ts`
- Modify: `vitest.config.ts`
- Modify: `playwright.config.ts`
- Delete: `.claude/launch.json`
- Modify: source and test files containing narrative or redundant comments

**Interfaces:**
- Preserves: CSP/security headers and authentication behavior for every existing route.
- Produces: no exemptions for nonexistent cron/feed routes and no upload-size override without an upload action.

- [x] Remove the unused Server Actions body-size override.
- [x] Remove nonexistent cron/feed public prefixes and their speculative tests.
- [x] Fix unused React imports and the unused route-handler request parameter.
- [x] Remove divider comments, file-summary comments, obvious narration, and historical incident essays while retaining correctness rationale.
- [x] Delete `.claude/launch.json` and run TypeScript plus ESLint.

### Task 5: Reconcile documentation and verify the repository

**Files:**
- Modify: `README.md`
- Modify: `docs/implementation-plan.html`

**Interfaces:**
- Produces: documentation that accurately separates built flows, schema preparation, and remaining work.

- [x] Update the architecture, dependency, script, testing, and known-gap descriptions.
- [x] Remove resolved gaps for trimester dates and opening balances; retain the still-real self-practice limitation.
- [x] State the remaining phases and distinguish schema-only groundwork from working features.
- [x] Run strict TypeScript, ESLint, and the full unit suite.
- [x] Run the production build and final repository checks.
