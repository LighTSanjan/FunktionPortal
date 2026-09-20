<div align="center">

<img src="docs/assets/funktion-logo.png" alt="FUNKtion" width="240">

# FUNKtion Treasury

**The treasury portal for FUNKtion — SUTD's Ultimate Popping & Locking Dance Club.**

Every fact gets entered once. Every document is a rendering of it.

[![CI](https://github.com/DarKSanjan/FunktionPortal/actions/workflows/ci.yml/badge.svg)](https://github.com/DarKSanjan/FunktionPortal/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-304890?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-58C0E8?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-304890?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-F05820?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Supabase](https://img.shields.io/badge/Postgres-Supabase-F8A838?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)

<img src="docs/assets/band.svg" alt="" width="100%" height="10">

</div>

It keeps the club's financial facts in one place and derives the documents and summaries from
those records. The detailed implementation history and remaining work are in
[`docs/implementation-plan.html`](docs/implementation-plan.html).

## Current scope

| Area | Status |
| --- | --- |
| Coach payments | Live: sessions, attendance, self-practice dates, monthly claims, invoices, attendance sheets, signing, void/re-raise, and submission tracking |
| Fee collection | Live: term collections, PayNow QR, member declarations, exco reconciliation, close-out, OSL Income Deposit Form workbook, and club summary document |
| Access and settings | Live: email OTP, Google and Microsoft sign-in, invitations, revocation, promotion requests, organisation settings, profiles, and stored signatures |
| Registers and attendance | Read-only register import, exceptional manual entries with reversible voids, and CSV attendance review/apply; register writeback is not implemented |
| Remaining roadmap | Production-service configuration, instructor photos, procurement, budgeting/Insights, contract administration, register writeback, and FY2027 handover |

The first real fee collection still needs to be run and checked with the treasurer before relying on
it for a live term.

## Architecture

This is a Next.js 16 App Router application. Server components and server actions own data access;
client components are used for interactive forms and previews.

```text
src/
├── app/                  # Routes and page composition
├── core/
│   ├── auth/             # Supabase SSR clients, sessions, and organisation context
│   ├── db/               # RLS-scoped dbAs() and core-only dbAdmin()
│   ├── permissions/      # Role permissions
│   ├── register/         # Imported and portal-generated ledger view
│   ├── storage/          # Private Supabase storage helpers
│   └── ui/               # Shared components and application shell
├── modules/              # Attendance, coach claims, fees, references, and workflows
└── proxy.ts              # Session refresh and route protection
```

Outside `src/`:

- `prisma/schema/` contains the domain-split Prisma schema and migrations.
- `templates/official/` contains the source OSL forms used to reproduce official layouts.
- `supabase/` contains local-stack SQL and Kong configuration.
- `docs/` contains the implementation plan and brand assets.

## Local development

Requirements: Node 20+ and Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. For the local stack, keep `NEXT_PUBLIC_SUPABASE_URL` set to
`http://localhost:8000` (Kong), use the local anon JWT as
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and keep `SUPABASE_SECRET_KEY` server-side. Do not use the
example secrets outside local development.

After changing the Prisma schema, run `npm run db:generate` and restart the development server so
it loads the regenerated client.

### Seed data

The idempotent seed creates the `funktion` organisation, FY2026 fund accounts, the FY2026 reference
counters, sample instructors and the 2026/2027 terms. Personal instructor addresses and bank
details are intentionally entered through the portal rather than stored in the repository.

## Business rules

- Money is stored as integer cents. GST is derived by the server.
- Claim amounts come from recorded sessions and the applicable rate for each session date.
- Reference numbers are allocated atomically inside the transaction that creates the document.
- Voided references remain void; a replacement receives a new reference.
- Every mutation checks the caller's server-side permission and is audited.
- `dbAs()` runs application queries through the RLS-scoped database role. `dbAdmin()` is restricted
  to core code.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm run start` | Build and serve production output |
| `npm run lint` | Run ESLint |
| `npm run test:run` | Run the Vitest suite once |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:e2e` | Run the auth Playwright suite |
| `npm run test:usability` | Run the usability Playwright suite |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply migrations to the target database |
| `npm run db:push` | Push schema without a migration (local only) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed the FY2026 opening state |
| `npm run db:verify-rls` | Verify the deployed RLS role and grants |
| `npm run auth:link` | Generate a sign-in link for an existing user |
| `npm run google:check` | Check Google Sheets access |
| `npm run db:encrypt-fields` | Encrypt configured sensitive fields |
| `npm run test:integration` | Run integration tests |
| `npm run test:stack` / `test:stack:down` | Start/stop the local integration stack |
| `npx tsx scripts/db/import-attendance.ts <file> "<term>" [--apply]` | Dry-run or apply an attendance CSV import |

## Testing

The unit suite covers money and rate arithmetic, claims, document composition, reference
allocation, permissions, audit logging, attendance parsing, fee collection, and UI primitives.

```bash
npx tsc --noEmit
npm run lint
npm run test:run
npm run build
```

CI runs typecheck, lint, unit tests, migrations, and database grant checks. Integration and browser
tests need the local Supabase stack and their required environment variables.

## Deployment checklist

1. Configure Supabase auth providers, redirect URLs, production email/SMTP, and
   `NEXT_PUBLIC_APP_URL`.
2. Create the `app_user` database role using `scripts/db/create-app-user.sql`.
3. Set `APP_USER_DATABASE_URL` and apply migrations with `npm run db:deploy`.
4. Create the private documents bucket with `npx tsx scripts/create-storage-bucket.ts`.
5. Apply the storage policies in `scripts/sql/storage-policies.sql` and verify RLS with
   `npm run db:verify-rls`.
6. Configure private security alerts (`SECURITY_ALERT_EMAILS`, `SECURITY_ALERT_FROM`,
   and a domain-restricted `RESEND_API_KEY`) and test both delivery and failure logging.
7. Choose a database and object-storage backup policy, then complete a restore drill before
   accepting live money records. See `docs/production-operations.md`.

Migrations are not run by `npm run build`; apply them explicitly for each environment.

## Roadmap

| Phase | Status |
| --- | --- |
| 01 — Coach documents and attendance | Complete, including self-practice and void/re-raise |
| 01b — Access lifecycle | Complete for invitations, revocation, promotion requests, and independent approval |
| 02 — Fee collection | Complete; first live collection pending |
| 02b — Attendance import and signatures | Complete; instructor photos remain |
| 03 — Stabilisation and treasurer acceptance | Production-safety pass complete; user acceptance pending |
| 04 — Procurement | Schema exists; forms and approvals are not implemented |
| 05 — Budgeting, Insights, and contracts | Planned after acceptance of current workflows |
| 06 — Production services | Recovery runbook complete; provider configuration and restore drill pending |
| 07 — Register sync | Read-only import is live; diff-and-approve writeback is not implemented |
| 08 — FY2027 handover | Planned for February–March 2027 |

For open historical register discrepancies and implementation decisions, see the implementation plan.
