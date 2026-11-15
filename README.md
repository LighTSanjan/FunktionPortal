<div align="center">

<img src="docs/assets/funktion-logo.png" alt="FUNKtion" width="240">

# FUNKtion Portal

**The treasury and membership portal for FUNKtion - SUTD's Ultimate Popping & Locking Dance Club!**

FUNKtion uses the portal in production to track attendance, membership fees, and coach payments, and to generate club finance documents.

Every fact is entered once. Every document is a rendering of it.

[![CI](https://github.com/DarKSanjan/FunktionPortal/actions/workflows/ci.yml/badge.svg)](https://github.com/DarKSanjan/FunktionPortal/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-304890?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-58C0E8?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-304890?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-F05820?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Supabase](https://img.shields.io/badge/Postgres-Supabase-F8A838?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)

<img src="docs/assets/band.svg" alt="" width="100%" height="10">

**[Try the hosted demo](https://funktion-portal-demo.vercel.app/) · [Open the live club portal](https://funktion-portal.vercel.app/)**

</div>

## What it is

A club treasurer's month is mostly transcription: which classes ran, who came, what each coach is
owed, and who has paid for the term, typed by hand into invoices, attendance sheets, registers and
spreadsheets. The portal keeps each of those facts in one place and produces the documents and
totals from them, following the SUTD Student Organisations Finance Guidelines.

| | |
| --- | --- |
| **Coach payments** | Classes and attendance become each coach's monthly invoice and attendance sheet: reference number allocated, month frozen, read, signed, sent to OSL and marked paid. |
| **Membership fees** | A term's join-and-pay form with a PayNow QR. Members declare payment with a screenshot; a *different* exco member confirms it. Closing produces OSL's Income Deposit Form. |
| **Welcome** | People not yet on the roster get a short welcome flow, say who they are, and go straight to paying. What they type is a claim for the exco to confirm, never a key. |
| **Records** | The roster, classes, coaches and rates, both transaction registers, and an append-only audit log. |
| **Access** | Sign-in by emailed code, Google or Microsoft. Invitations, access requests, exco roles and offices. |

## The handbook

[`docs/handbook.html`](docs/handbook.html) is the full, authoritative description of the portal.
Open it in a browser. It covers:

- the architecture and how a request moves through it;
- signing in, email proof, standing, roles and permissions;
- every table in the data model, with a diagram;
- the security model: row-level security, database guards, private files;
- the fee, coach-payment and attendance-import flows step by step;
- reference numbers, GST and funds;
- environments, settings, tests, deployment, backups and recovery;
- open work and known gaps in the club's own records.

If this README and the handbook disagree, the handbook wins. If the handbook and the code
disagree, the code wins and the handbook needs fixing.

## Try it

**Hosted demo.** A copy of the portal with a made-up club. The sign-in page lets you be the
treasurer, the president, a member, or a newcomer with one click. Nothing there is real, nothing is
emailed, and it is reset now and then with `npm run demo:seed`.

**Live club portal.** The production portal is for FUNKtion members and requires sign-in.

**On your machine.** You need Node 24 and Docker.

```bash
npm install
npm run demo
```

That starts a local Supabase stack in Docker, fills it with a made-up club, and serves the portal at
<http://localhost:3100>. Sign-in codes land in the local mail catcher at <http://localhost:58025>,
which the sign-in page links to.

## Project layout

```text
src/
├── proxy.ts          Session refresh, sign-in gate, security headers
├── app/              Routes: (auth) for signing in, (dashboard)/[orgSlug] for everything else
├── actions/          Server actions that belong to no single module
├── core/             Auth, database access, audit, alerts, storage, permissions, UI kit
├── modules/          fees, membership-form, coach-claim, attendance, references, register, …
└── lib/              Small shared helpers (dates, formatting)
prisma/schema/        The schema, split by domain; prisma/migrations holds RLS, grants, triggers
scripts/              Database setup, imports, the demo, the local test stack
e2e/                  Playwright journeys and screenshot tours
docs/handbook.html    The handbook
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (needs a filled-in `.env.local`) |
| `npm run demo` | Local stack plus a made-up club at <http://localhost:3100> |
| `npm run lint` · `npx tsc --noEmit` | Lint and typecheck |
| `npm run test:run` | Unit tests |
| `npm run test:integration` | Server actions against the local database, as real users |
| `npm run test:usability` | Playwright browser journeys against a production build |
| `npm run test:tour` | Screenshots of every screen, desktop and phone |
| `npm run test:stack` · `test:stack:down` | Start or remove the local Supabase stack |
| `npm run db:migrate` | Create a migration while developing |
| `npm run db:deploy` | Apply migrations to the database in `.env` |
| `npm run db:verify-rls` | Prove the deployed database enforces row-level security |
| `npm run db:seed` | Seed the real club's FY2026 opening state |
| `npm run demo:seed` | Reset the hosted demo's database (reads `.env.demo`) |
| `npm run db:encrypt-fields` | Encrypt coach bank details already stored in plain text |
| `scripts/db/backup.sh` | Download the live database and its stored files to `~/Backups/FunktionPortal` (once a day; `--force` for another) |
| `scripts/db/install-backup-agent.sh` | Run that backup at login and daily at 21:00 on this Mac (`--remove` to stop) |
| `npx tsx scripts/db/import-attendance.ts <file> "<term>" [--apply]` | Import an attendance CSV from the command line |

## Deploying

1. Configure the Supabase project: auth providers, redirect URLs, a transactional email sender.
2. Once per database: create `app_user` (`scripts/db/create-app-user.sql`), give it a login
   (`scripts/db/set-app-user-password.sh`), and create the private bucket
   (`npx tsx scripts/create-storage-bucket.ts`).
3. Set the environment variables in Vercel. `.env.example` documents every one.
4. For each release, run `npm run db:deploy` **before** merging. The build never runs migrations.
5. Merge to `main`; Vercel deploys. Then run `npm run db:verify-rls` and sign in once to check.

Backups, recovery and alerting are in the handbook's Operations section. Use Supabase Pro for live
money records: the Free plan has no backups and pauses idle projects.

## Rules the code keeps

- Money is integer cents. GST is derived from the gross, never typed.
- The browser never posts a money figure. Fees come from the term's rates or an exco decision;
  claims come from classes × the rate in effect on each date.
- Reference numbers are allocated atomically in the transaction that writes the document, and are
  never reused.
- Nothing financial is deleted. It is voided with a reason, and the audit log keeps before and after.
- Every query runs through `dbAs()`, as the `app_user` role, under row-level security. `dbAdmin`
  bypasses it and stays inside `src/core`.
- The person who declares a payment can never be the person who confirms it. The database enforces
  this, not only the app.
