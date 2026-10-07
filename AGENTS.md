<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Design System & AI Writing Rules (READ FIRST)

> **Authority:** All UI work in this repo must follow `docs/design.md` and `docs/skill.md`. These two files define the project's anti-AI-slop and AEO/GEO rules, the design tokens, and the AEO copy patterns.

## Key references (do not rewrite from memory)

- `docs/design.md` — colors, typography, spacing, components, AEO copy templates
- `docs/skill.md` — full ban-list of anti-slop and AEO failure patterns (paste-ready for PR descriptions)
- `docs/ui-ux-audit.md` — 2026-09-26 UI audit baseline (score 4.5/10); the issues called out here are still being fixed across Phases 1-3
- `docs/role-differentiation-plan.md` — 5-phase roadmap for tourist vs buddy UX
- `.claude/skills/web-ai-slop.md` — upstream anti-slop skill source (do not modify; copy lives at `.claude/skills/`)
- `.claude/skills/aeo-geo-writing.md` — upstream AEO/GEO skill source (do not modify)

## Skill locations and repair (read this if a skill is missing)

The two web-ai skills (`web-ai-slop`, `aeo-geo-writing`) are mirrored in **four** paths so every agent runner picks them up:

| Path | Read by |
|---|---|
| `.agents/skills/<name>/SKILL.md` | skills.sh canonical |
| `.claude/skills/<name>/SKILL.md` | Claude Code, primary Cursor read path |
| `.claude/skills/<name>.md` | legacy mirror (some Cursor versions) |
| `agent/skills/<name>/SKILL.md` | secondary mirror |

If any of these is missing, truncated, or you suspect drift between copies, run `node scripts/install-skills.mjs` — it copies the canonical `.agents/skills/<name>/SKILL.md` into the other three locations.

To **update from upstream** (new anti-slop patterns, AEO platform tuning):

1. Fetch `web-ai-slop/SKILL.md` and `aeo-geo-writing/SKILL.md` from <https://github.com/sahilkargutkar/web-ai-slop>
2. Overwrite `.agents/skills/<name>/SKILL.md` (the canonical source)
3. Run `node scripts/install-skills.mjs` to fan out to the three mirrors
4. Commit with conventional `chore:` prefix

## Anchor for any UI work (per `web-ai-slop` Section 1a)

LOCALit's design is triangulated from:
1. **Da Nang tourism board print tradition** — informational density, Vietnamese + English bilingual, real Da Nang photos (Marble Mountains, Han River, Son Tra, My Khe Beach, etc.)
2. **Withlocals information density** — operational metrics visible to operators, traveler-centric filters

**Anti-reference:** generic SaaS landing page. We are not Stripe, not Linear, not Vercel. We are a marketplace for human travel experiences in one specific city.

## Current state (as of 2026-10-01)

- **Single-web architecture (2026-10-01)** — `/tourist/*` and `/buddy/*`
  URL prefixes have been retired. The whole site is one flat URL
  space; both tourists and buddies land on `/dashboard` after sign-in
  and use the same nav chrome. The `profiles.role` enum and RLS
  policies are unchanged (still used for authorization and the
  matching algorithm), but the UI no longer branches on role.
  - ✅ All 22 routes served from flat URLs (`/dashboard`, `/browse`,
    `/profile`, `/trips`, `/trips/create`, `/trips/[id]`,
    `/buddies/[id]`, `/chat`, `/map`, `/itinerary/[id]`,
    `/review/[tripId]`)
  - ✅ Header: 2 variants (guest / logged-in) — same nav for both
    roles
  - ✅ Footer: 4 columns (Explore / Account / Get involved / Support)
  - ✅ Homepage: "How LOCALit works" section replaces the old
    "Two products, one city" (no longer distinguishes UI by role)
  - ✅ middleware.ts 308-rewrites `/tourist/*` and `/buddy/*` to the
    flat equivalents (preserves bookmark/SEO continuity)
  - ✅ `app/buddy/` and `app/tourist/` removed entirely
- **Phase 1 DONE** (all 26 routes migrated to the flat enterprise design):
  - ✅ Header unified to 1 component with 3 role variants (guest / tourist / buddy)
  - ✅ Footer slim with AEO answer capsule + 4 nav columns
  - ✅ Homepage refactored: hero photo (real Da Nang), 3 declarative metric cards (6+ buddies, $15–$45, 0% commission), 6 action items, 4 FAQ entries with FAQPage JSON-LD
  - ✅ Tourist dashboard: live map at top (per user requirement), BuddiesAvailableNow, flat trips/buddies list, role-aware quick actions
  - ✅ Buddy dashboard: "Hi Lan" greeting, status toggle (Accepting requests), earnings card, request summary, upcoming trips
  - ✅ /tourist/browse: flat accordion rows with map sidebar popup, real distance calc
  - ✅ /chat: role-aware quick actions, formatted timestamps
  - ✅ /buddy/requests: urgency badges (Waiting 24h+), filter chips, sort pending first
  - ✅ /tourist/trips + /trips/create + /trips/[id]: flat rows, status pills, stop builder
  - ✅ /tourist/profile + /buddy/profile: semantic `<fieldset>`/`<legend>` tabs, public preview link
  - ✅ /map: flat map with legend card + selected-buddy popup, share-location button
  - ✅ /login + /register + /forgot-password + /reset-password + /verify-email: single-column flat forms with Lucide icons
  - ✅ All page-level CSS files deleted (5 files). Only `app/globals.css` remains.
  - ✅ Build: 26 routes, 0 TypeScript errors, ~13s
  - ✅ Deployed to `https://localit-nhattoann.vercel.app/` and `https://localit-vn.vercel.app/`
- **📋 Phase 2 pending**: profile completeness score, DiceBear avatar fallback, react-leaflet-cluster
- **📋 Phase 3 pending**: /buddy/earnings with Chart.js, KYC verification badge, trip photos Storage bucket, auto-translate chat

## Banned without explicit justification (paste into PR description)

- `border-radius` ≥ 8px on cards / buttons / inputs (use 4px)
- `box-shadow` other than `var(--shadow-focus)` (we are FLAT)
- `backdrop-filter: blur()` anywhere
- `linear-gradient(...)` other than `var(--primary)`-only subtle hover states
- emoji as icons (use Lucide)
- Inter font (Poppins + Plus Jakarta Sans + JetBrains Mono)
- "Get Started" / "Learn More" CTAs (state the result)
- "In today's fast-paced world..." openers
- "Whether you're a tourist or a buddy..." openers
- "Unlock / Elevate / Supercharge / Empower" anywhere
- Pure `#000000` or `#FFFFFF` background (use `#0F0F0F` and `#FAFAF7`)
- `<div>` where `<main>` / `<nav>` / `<article>` / `<section>` would fit
- `console.log` in production code
- Scratch files (`check.html`, `scripts/test-*.mjs`, etc.) committed

## Token names (use these, do not hardcode hex)

Colors: `--primary`, `--primary-hover`, `--ink`, `--paper`, `--surface`, `--border`, `--border-strong`, `--muted`, `--subtle`, `--success`, `--success-bg`, `--warning`, `--warning-bg`, `--danger`, `--danger-bg`, `--info`, `--info-bg`

Spacing (Tailwind v4 utility names): `1`, `2`, `3`, `4`, `6`, `8`, `12`, `16`, `24`

Type scale: `text-xs` through `text-6xl` (rem-based, see design.md Section 3.2)

---

# LOCALit Project Context

> Pre-loaded context for the LOCALit tourist-buddy platform. Read this first in any new session to skip setup steps.

## Project Identity

- **Name**: LOCALit (Kỳ 8 — final-year project)
- **Stack**: Next.js 16.3.6 (App Router, Turbopack) + TypeScript + Supabase (Postgres + RLS) + Vercel
- **Repo**: `D:\1_F_Matierials\Kỳ 8\LOCALit\localit-app` (Windows, PowerShell, git on `main` branch)
- **Owner**: `nhattoann` on Vercel, Supabase project ref `pqvnjgyqbxlylawwogjv`

## Live Endpoints

- **Canonical Production** (always aliases to the latest deploy):
  - `https://localit-nhattoann.vercel.app/` ← production
  - `https://localit-vn.vercel.app/` ← production alias
  - `vercel ls --prod` shows the latest hash URL — every deploy produces a
    new `localit-XXXXXXXXXXX-nhattoann.vercel.app` URL, but the canonical
    alias above is what users see and share. **Do not hard-code the hash URL.**
  - Last deploy: 2026-10-07 (auth signup flow rewrite — pg-direct
    `auth.users` insert, real-account sign-in verified end-to-end)
- **Stale URLs that should NOT be shared**: every prior deployment URL
  (e.g., `localit-menf0nwha-nhattoann.vercel.app` from the dashboard
  redesign) remains publicly accessible as an immutable Vercel deployment.
  These older URLs may carry **vulnerable code** that has since been
  patched on canonical production. Disable via the Vercel dashboard if
  they leak in screenshots, slides, or auto-redirects.
- **Supabase URL**: https://pqvnjgyqbxlylawwogjv.supabase.co
- **Supabase Dashboard**: https://supabase.com/dashboard/project/pqvnjgyqbxlylawwogjv

## Security Status (as of 2026-09-26)

The red-team audit (full report: `scripts/REPORT.md`) found 12 issues. Current status:

| # | Severity | Status | What was done |
|---|----------|--------|---------------|
| 1 | CRITICAL: create-profile autoConfirm IDOR | ✅ Closed | `autoConfirm` deprecated; route now requires cookie session OR one-shot signup token |
| 2 | CRITICAL: PII leak (tourists/buddies/reviews) | ✅ Closed | Column-level GRANT/REVOKE; bio/DOB/reviewer_id hidden from anon |
| 3 | HIGH: no signup rate limit | ✅ Closed | 5 req / 60s / IP (in-memory) |
| 4 | HIGH: email enumeration on /signup & /signup-admin | ✅ Closed | Both return generic 400 for any failure — no 200/409 oracle |
| 5 | HIGH: OTP brute-force window | ✅ Closed | verify-otp 10/60s/IP; resend-otp 3/60s/IP + per-user 5-attempt cap |
| 6 | HIGH: stored XSS in full_name/bio | ✅ Closed | Server-side sanitizer strips `<…>` and control chars; 100/500 char caps |
| 7 | HIGH: `on_auth_user_created` trigger missing | ✅ Fixed | Reinstalled (`scripts/install-missing-trigger.mjs`) and given explicit `search_path`; defensive profiles-upsert added to signup-admin |
| 8 | MEDIUM: user enumeration on verify-otp/resend-otp | ✅ Closed | Generic `no_code` / `no_user` errors only |
| 9 | MEDIUM: password too weak (≥ 6 chars) | ✅ Tightened | `utils/password-validator.ts`: ≥ 10 chars + letter + non-letter |
| 10 | LOW: type confusion / oversized payloads | ✅ Closed | Hard length caps + array sanitization |
| 11 | LOW: misleading 200/204 on RLS-blocked writes | ⚠️ Documented | Supabase REST behavior — not a security hole, only DX |
| 12 | LOW: Vercel bypass token shared | ⚠️ Documented | Token was already configured; treated as known low-severity finding |

How to verify the production state is still clean: run
`node scripts/redteam-final.mjs` (or any of the `scripts/redteam-*.mjs` probes
individually — they target the canonical `localit-nhattoann.vercel.app`).

## Credentials (session-cached — reuse if same task)

If user provides these again, **store them in env vars, do NOT hardcode**:

```bash
SUPABASE_PROJECT_REF=pqvnjgyqbxlylawwogjv
SUPABASE_URL=https://pqvnjgyqbxlylawwogjv.supabase.co
SUPABASE_ANON_KEY=sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE
SUPABASE_DB_PASSWORD=that1arlecchino
SUPABASE_DB_HOST=db.pqvnjgyqbxlylawwogjv.supabase.co
SUPABASE_DB_PORT=5432
```

- **Postgres connection**: `postgresql://postgres:${SUPABASE_DB_PASSWORD}@${SUPABASE_DB_HOST}:5432/postgres`
- **Service role + DB password** give full admin access. Anon key is publishable + RLS-protected.

## Vercel Env Vars (already configured in Production)

- `NEXT_PUBLIC_SUPABASE_URL` = `https://pqvnjgyqbxlylawwogjv.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE`
- Plus legacy keys: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `POSTGRES_*`
- ⚠️ **Past mistake**: a previous session accidentally pasted a JWT (`eyJ...`) into `NEXT_PUBLIC_SUPABASE_URL`. If you see similar symptoms (HTML renders but client-side Supabase errors), `vercel env rm` then re-add with the correct URL.

## Database State (as of 2026-09-27, after test-data cleanup + orphan-table drop)

### Rows (live production)
- `auth.users`: **9 rows** (all seed; see "Seed Accounts" below)
- `public.profiles`: **9 rows** (1:1 with auth.users, FK cascade)
- `public.tourists`: 3 rows | `public.buddies`: 6 rows
- `public.connections`: 4 | `public.conversations`: 2 | `public.messages`: 9
- `public.trips`: 4 | `public.trip_stops`: 8 | `public.reviews`: 1
- `public.location_updates`: 15 | `public.message_reactions`: 0
- `public.trip_travelers`: 3 | `public.trip_buddies`: 2
- All remaining public tables (`trip_days`, `trip_bookings`, `trip_budget`, `trip_packing_items`, `trip_activity`): 0 rows but preserved (used by the itinerary planner)
- All tables have RLS enabled (forced=false)

### Public schema: 20 objects (down from 24 as of 2026-09-27)
- 14 tables: profiles, tourists, buddies, connections, conversations, messages, reviews, location_updates, trips, trip_stops, trip_days, trip_bookings, trip_budget, trip_packing_items, trip_activity, trip_travelers, trip_buddies, message_reactions
- 3 views: safe_profiles, shared_trip_view
- Orphan tables DROPPED on 2026-09-27: call_logs, call_signals, email_verifications, safe_reviews (none referenced by current app code; see `supabase/migrations/2026-09-27-drop-orphan-tables.sql`)

### Auth Triggers
- `on_auth_user_created` trigger on `auth.users` → inserts into `public.profiles`
- `profiles_updated_at` trigger on `public.profiles` → auto-updates `updated_at`
- Same pattern on `tourists`, `buddies`, `connections`, `trips`, `conversations`
- ⚠️ **The trigger can silently disappear** if `schema.sql` is partially re-applied or if Supabase re-provisions its internal auth schema. **Always verify** with:
 ```
 node -e "const{Client}=require('pg');new Client({...}).query(\"SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal\").then(r=>console.log(JSON.stringify(r.rows)))"
 ```
 If empty, re-run `scripts/install-missing-trigger.mjs`.

### RLS Grants for `service_role` (CRITICAL)
- ⚠️ **Supabase Cloud does NOT auto-grant table-level privileges to `service_role`.** If you re-run `schema.sql` or apply migrations that re-`GRANT TO authenticated`, you can silently strip grants from `service_role`. Symptom: `permission denied for table <name>` on every admin route.
- **Fix**: `node scripts/fix-grants.mjs` (idempotent — adds INSERT/UPDATE/SELECT/DELETE on every public table to `service_role`).
- **Verify**:
  ```bash
  node -e "..." # see scripts/diag-tourists-grants.mjs
  ```

### Email Verification (OTP at Step 1 of Signup — 2026-09-27)
- The sign-up flow now requires email verification BEFORE creating the auth.users row.
- The `public.email_verifications` table was re-created on 2026-09-27 (was dropped earlier that day) with a new schema keyed by email instead of user_id.
- Active flow (4 steps):
 1. **`/register` Step 0** (Personal info: name, phone, email, password, terms) → submit
 2. **`POST /api/auth/signup/start`** (5 req/min/IP) → server hashes password, generates 6-digit OTP, inserts row in `email_verifications`, sends code by Resend. Returns `{ signupId, email, expiresInSeconds }`.
 3. **`/register` Step 1** (Verify email: 6 individual digit boxes, paste support, 60s resend cooldown) → user enters code
 4. **`POST /api/auth/signup/verify-otp`** (10 req/min/IP) → server checks bcrypt-hashed code, sets `verified_at`. On success, advance to next step.
 5. **`/register` Step 2** (Choose role: Tourist / Buddy) → skip if `?role=` was provided
 6. **`/register` Step 3** (Tags & bio: nationality/interests/languages for tourist, or city/specialties/bio for buddy)
 7. **`POST /api/auth/signup/complete`** (10 req/min/IP) → server validates `verified_at IS NOT NULL` + `consumed_at IS NULL`, creates `auth.users` (with `email_confirm: true` since user already proved ownership), inserts profile + tourist/buddy, sets `consumed_at`. Returns `{ userId, email }`.
 8. Client calls `signInWithPassword()` → redirect to dashboard.
- Resend: `POST /api/auth/signup/resend-otp` (3 req/min/IP) invalidates prior code and issues a new one.
- The `signupId` is a UUID (unguessable) treated as a bearer secret between `/start` and `/complete`.
- See: `app/api/auth/signup/{start,verify-otp,resend-otp,complete}/route.ts`, `utils/otp.ts`, `supabase/migrations/2026-09-27-restore-email-verifications.sql`.
- ⚠️ **Resend test-mode restriction**: `EMAIL_FROM=onboarding@resend.dev` (default) can only send to the Resend account owner email. To send OTP to arbitrary recipients, verify a domain at https://resend.com/domains and set `EMAIL_FROM=noreply@yourdomain.com`.
- 🛠️ **Dev preview mode** (test-only, currently ENABLED in production for testing): set `OTP_PREVIEW=true` to make `/api/auth/signup/start` and `/resend-otp` echo the OTP code in the response under the `__devCode` field (instead of sending an email). Set `OTP_PREVIEW_ALLOW_REUSED=1` additionally to bypass the duplicate-email check (so you can re-register the same address during testing without manually cleaning the DB). **MUST be unset before public launch** — anyone hitting `/start` could then complete signup without ever checking the email.
- DELETED (replaced by `/signup/*` routes): `app/api/auth/signup/route.ts`, `app/api/auth/signup-admin/route.ts`, `app/api/auth/verify-otp/route.ts`, `app/api/auth/resend-otp/route.ts`, `app/verify-email/page.tsx`.

### Data Types (column types differ from what you might assume)
- `tourists.interests`: `TEXT[]` (PostgreSQL array), NOT `jsonb`. Insert with `ARRAY['food','photo']::text[]`
- `tourists.languages`: `TEXT[]`, same
- `buddies.languages`: `TEXT[]`
- `buddies.specialties`: `TEXT[]`
- `profiles.role`: `user_role` enum (`tourist` | `buddy` | `admin`)

### Seed Accounts
These are pre-created via direct DB insert (bypassing the OTP flow) so they can be used for testing without an inbox:
- Buddy: `lan.pham@localit.dev` / `password123`
- Tourist: `john.doe@example.com` / `password123`
- See `scripts/seed-accounts.mjs` for the full list of 9 seed users.

To register a NEW account via the UI, the user must complete OTP verification (see "Email Verification" section above). Resend's test mode restricts sending to the account-owner email (`darklunatv@gmail.com`) only — see warning there.

## CLI Tooling on This Machine

- **psql**: ❌ NOT installed — use `pg` package via Node scripts instead
- **Supabase CLI**: not in PATH globally — use `npx --yes supabase ...` (may need access token, prefer direct `pg` connection)
- **Vercel CLI**: ✅ installed globally — `vercel --yes`, `vercel --prod --yes`, `vercel env ls/add/rm`, `vercel curl`, `vercel inspect` all work
- **Node.js 24.14.0** + npm available

## Verified Workflows (don't reinvent)

### A. Connect to Supabase Postgres from Node

```bash
npm install pg --save-dev
```

```js
// scripts/db.mjs
import { Client } from 'pg'
const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
const { rows } = await client.query('SELECT * FROM public.test_items')
await client.end()
```

### B. Deploy to Vercel

```bash
git add -A && git commit -m "<msg>"   # env vars don't trigger rebuild — code changes do
vercel --prod --yes                    # returns new *.vercel.app URL; old URL may 404
```

If a preview URL returns 200 but client-side data fetch fails, the env vars in Production may be wrong — `vercel env ls` and `vercel env pull .env.tmp --environment production --yes` to inspect.

### C. Verify Production End-to-End

1. `vercel curl <prod-url>` → check HTML status + key strings
2. Use `cursor-ide-browser` MCP: `browser_navigate` + `browser_snapshot` to confirm runtime behavior (Supabase fetch happens client-side, not in initial HTML)

## Known Pitfalls

### Auth/Profile Triggers (CRITICAL)
- **The `on_auth_user_created` trigger on `auth.users` can silently disappear.** If it does, every new sign-up creates an `auth.users` row but NOT a `public.profiles` row. This then causes `/api/auth/create-profile` to fail with a **foreign-key violation** (tourists/buddies require `profiles.id`). Symptoms: 500 on sign-up completion.
- **Fix**: Run `scripts/install-missing-trigger.mjs` (idempotent). The trigger function `public.handle_new_user()` also needs to exist (it survives even when the trigger binding is dropped).
- **Trigger function gotcha**: `public.handle_new_user()` is `SECURITY DEFINER` and must have `SET search_path TO 'public', 'pg_catalog'` — otherwise the unqualified `'tourist'::user_role` cast fails with `type "user_role" does not exist` and GoTrue returns `500 Database error creating new user`. If you see that error in `vercel logs`, check the function's search_path.
- **Daily health-check**: `node scripts/check-current-triggers.mjs` confirms the trigger is still bound. Wire into a Vercel cron / GitHub Action when convenient.
- **Defensive code**: `app/api/auth/create-profile/route.ts` AND `app/api/auth/signup-admin/route.ts` now have a fallback that upserts a `profiles` row if the trigger missed, so the routes work even if the trigger is absent.

### Vercel Deployment Protection
- **`vercel env rm` is DANGEROUS without `--yes` confirmation** — the CLI may still prompt but PowerShell eats the prompt and proceeds anyway.
- **Production URLs change per deploy.** The URL `localit-ax3tzd5l3` is stale (no longer aliased). Always get the current URL from `vercel ls --prod` (first line is latest).
- **Node.js `fetch` to production Vercel URL gets 302 → `vercel.com/sso-api`** (Vercel Deployment Protection gate). Use `vercel curl <url>` for programmatic checks, or accept 302 as "reachable but gated" in diagnostics.

### Supabase Auth Sign-Up (500 error) — RESOLVED 2026-10-07
- **Root cause**: Supabase's public `/auth/v1/signup` endpoint is rate-limited
  per project (~4 emails/hour on the free tier) and fails with
  `over_email_send_rate_limit` because it sends a confirmation email by
  default. GoTrue's sign-in path also requires the `auth.users` row to
  have every GoTrue-required column populated (email_change, recovery_token,
  phone_change_token, etc.) — values that the default column defaults
  populate if you DON'T list it in the INSERT clause, but stay NULL if you
  explicitly set them in a single INSERT.
- **Fix**: `utils/db-pg.ts → createAuthUser()` now does the proven
  fix-seed-users.mjs pattern:
   1. INSERT a minimal `auth.users` row (id, email, instance_id, aud, role)
   2. UPDATE all GoTrue-required columns with `COALESCE(col, default)`,
      using `crypt($pw, gen_salt('bf'))` from pgcrypto for the password
      (matches what GoTrue's signin path validates against — bcryptjs
      produces a slightly different format that pgcrypto rejects).
   3. INSERT the matching `auth.identities` row with `jsonb_build_object(...)`.
  Password is bcrypt-hashed-equivalent, email is pre-verified by our own
  OTP step, no extra email is dispatched, no GoTrue email rate limit is hit.
- **Verified end-to-end**: created `e2e-real@autotest.dev` via the
  `/api/auth/signup/{start,verify-otp,complete}` flow, signed in via the
  `/login` UI → landed on `/dashboard` for `e2e-real`. JWT access_token
  issued by Supabase, full_name + role present in user_metadata.
- **Edge cases handled**:
   - `auth.instances` row required for instance_id lookup
     (`'00000000-0000-0000-0000-000000000000'` was inserted on 2026-10-07
     by `scripts/insert-instance.mjs`).
   - `::jsonb` casts in INSERT values trigger pg prepared-statement parser
     to misinterpret the bcrypt `$2a$10$…` chars inside JSON strings as
     `$N` placeholders, causing "bind message supplies N parameters,
     but prepared statement requires M" errors. Solution: avoid the
     `::jsonb` cast — Postgres auto-casts text → jsonb.

### Register Page Step Order (2026-09-26)
- `/register` flow now: **Step 0 = Personal info (name/phone/email/password/terms)** → **Step 1 = Role (Tourist/Buddy)** → **Step 2 = Tags & bio (role-specific)**.
- Step 0 uses `stepReady` for name length + email regex + password ≥ 6 chars + match + terms. Step 2 validates nationality+style+interests+languages for tourists, or city+languages+specialties+bio(≥30) for buddies.
- `?role=tourist|buddy` query param still skips Step 1 (defaulting the role). Useful for marketing links.
- "Change" link on Step 2 returns the user to Step 1 (role); the back button on Step 2 also returns to Step 1; Step 1 has a topbar back button returning to Step 0.
- Stepper is shown on every step now (previously only after step 0).

### Signup Flow (Simplified 2026-09-26)
- **No more OTP/verify-email step.** Account is created with `email_confirm: true`. Client calls `signIn()` itself after the server returns userId. If sign-in fails, client is redirected to `/login?registered=1`.
- Endpoint: `POST /api/auth/signup` (replaces the older `signup-admin` for the simple case).
- Legacy `signup-admin` + `verify-otp` + `resend-otp` still exist for the OTP flow but are no longer called from the UI.

### Security Hardening (2026-09-26 — Red Team Audit)
The project was put through a Red Team audit and the following issues were found and fixed:

**Critical**
- `profiles` table had a public `SELECT` policy — anon users could read emails, phones, full names of ALL registered users (GDPR violation).
  - Fix: `supabase/migrations/2026-09-26-rls-profiles-restrict.sql` restricts SELECT to `auth.role() = 'authenticated'`. Public discovery uses `safe_profiles` view (`id`, `full_name`, `role`, `avatar_url` only).
  - The home page now joins buddies→safe_profiles instead of buddies→profiles.
  - Run with: `node scripts/apply-migration.mjs supabase/migrations/2026-09-26-rls-profiles-restrict.sql`

**High**
- `autoConfirm: true` on `create-profile` allowed ANY caller to confirm arbitrary users within a 15-minute window (incl. IDOR over arbitrary victim userIds).
  - Fix: the `autoConfirm` flag is now DEPRECATED. New auth path uses a one-shot `signupToken` issued by `/api/auth/signup` (5-min TTL, single-use, scoped to a userId). Cookie-session users are still accepted.
- No rate limit on `/api/auth/signup`, `/api/auth/signup-admin`, `/api/auth/create-profile`, `/api/auth/resend-otp`, `/api/newsletter/subscribe`.
  - Fix: `utils/rate-limit.ts` is a per-IP in-memory token-bucket limiter. signups throttle at 5/min, create-profile at 10/min, resend-otp at 3/min, newsletter at 3/min.

**Medium**
- `/api/newsletter/subscribe` accepted cross-origin POSTs (CSRF).
  - Fix: same-origin check on `Origin`/`Referer` against `Host`.
- Email enumeration via `/api/auth/signup` (different error for existing vs fresh email).
  - Fix: identical generic message for both cases ("Sign up could not be completed with these details.").
- XSS via `full_name` / `bio` / `location_city` (HTML was stored verbatim and rendered as raw text in some components).
  - Fix: server-side stripping of control chars + `<...>` tags before insert.
- OTP brute force: 25 random code attempts against a fresh userId.
  - Fix: the OTP route itself already enforced `attempts >= MAX_ATTEMPTS` (5) in `utils/otp.ts`. Verified working.

**Defensive utilities added**
- `utils/rate-limit.ts` — `rateLimit(key, bucket, opts)`, `getClientIp(req)`, `rateLimitResponse(resetAt)`.
- `scripts/apply-migration.mjs` — applies SQL migrations to Supabase.
- `scripts/verify-defenses.mjs`, `scripts/verify-defenses-via-vercel.mjs`, `scripts/verify-profiles-db.mjs` — post-deploy checks.

**How to verify quickly**
```
# Rate limit (expect 429 after 5 reqs)
for ($i = 1; $i -le 7; $i++) { vercel curl <prod>/api/auth/signup -X POST -H "content-type: application/json" -d ('{"email":"v' + $i + '-' + (Get-Date).Ticks.ToString() + '@test.com","password":"password123","fullName":"V","role":"tourist"}') }

# CSRF newsletter (expect 403)
vercel curl <prod>/api/newsletter/subscribe -X POST -H "content-type: application/x-www-form-urlencoded" -H "origin: https://evil.example.com" -d "email=evil@evil.com"

# IDOR create-profile (expect 401)
vercel curl <prod>/api/auth/create-profile -X POST -H "content-type: application/json" -d '{"userId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"buddy","payload":{}}'

# Anon profiles read (expect [])
curl 'https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/profiles?select=*&limit=2' -H "apikey: sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE" -H "authorization: Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE"
```

### Postgres / Node `pg` quirks (Windows PowerShell)
- **PowerShell does NOT support inline env prefix**: `VAR=value node script` is invalid. Use `$env:VAR="value"` before the command, or chain: `cmd /c "set VAR=value&& node script"`.
- **PowerShell here-strings**: do NOT use `Get-Content file | node` or pipe into node; pipe `node script` output through `Out-String | Select-String` instead of grep.
- **`node -e "..."` with backslash-escaped quotes fails** on PowerShell — always use a temp `.mjs` file for anything with complex quotes.
- **Node `pg` parameter inference**: `gen_random_uuid()` + `$1` in the same INSERT confuses pg's type system. Use explicit `::uuid` casts or string interpolation (only for trusted test scripts).

### Supabase / GoTrue Schema Gotchas
- `auth.users.encrypted_password` must use `crypt('pw', gen_salt('bf'))` — plain text is rejected.
- `auth.identities` must be seeded alongside `auth.users` for sign-in to work. Required columns: `id` (uuid), `user_id` (fk → auth.users), `identity_data` (jsonb with `sub`, `email`), `provider`, `provider_id`.
- `profiles.email` is `NOT NULL` — if you upsert without an email, use empty string `''` as placeholder.
- `profiles.role` is `user_role` enum — cast to `::user_role` when inserting.

### Next.js / Turbopack
- Next.js 16 Turbopack builds in ~2s, but first install in cold cache takes ~10s.
- Service role key bypasses RLS — never expose in `NEXT_PUBLIC_*` vars or client code.
- `vercel env add <NAME>` will error if the name already exists — use `vercel env rm` first.

## Next Steps / Roadmap (for future sessions)

When user returns, ask if they want to:

1. Add custom domain (e.g., `localit.app`)
2. ~~Build auth flow~~ ✅ **Done** — email/password sign-up/sign-in with role-specific profiles (tourists/buddies), auto-confirm email, `/api/auth/create-profile` route
3. ~~Create domain schema~~ ✅ **Done** — `tourists`, `buddies`, `trips`, `trip_stops`, `connections`, `conversations`, `messages`, `reviews`, `location_updates`
4. Implement matching algorithm (tourist preferences ↔ buddy expertise/location)
5. Real-time chat (Supabase Realtime)
6. Image uploads (Supabase Storage)
7. Payments (Stripe)
8. i18n (English primary, Vietnamese secondary)
9. **Voice calls** — self-hosted WebRTC with Supabase Realtime broadcast signaling (see "WebRTC Voice Calls" section below). Buddies are reachable from any authenticated page because the BackgroundCallService is mounted in AppShell.

## WebRTC Voice Calls (2026-10-01 — LiveKit Cloud rewrite)

The self-hosted WebRTC stack was abandoned in favor of LiveKit
Cloud because:

- **Stringee trial was 1 month** — not viable for a final-year project.
- **Self-hosted signaling was too brittle** — bespoke SDP plumbing
  consumed a lot of tokens and still failed across symmetric NATs.
- **LiveKit's free tier covers our needs** — global TURN, codec
  negotiation, reconnect logic all baked into `livekit-client`.

### Stack

`livekit-server-sdk` + `livekit-client`. Token issuance on the
backend; browser joins a LiveKit room on demand.

| File | Purpose |
|---|---|
| `app/api/livekit/token/route.ts` | Mints a LiveKit AccessToken scoped to `call:<conversationId>`. Verifies the caller via `supabase.auth.getUser()`. Rate-limited 30/min/IP. |
| `lib/webrtc/livekit-client.ts` | Thin wrapper around `Room`: connect, publish mic, subscribe to remote audio, mute/end/dispose. |
| `app/chat/page.tsx` | startCall / acceptCall now `await startLiveKitCall({...})` and `client.publishMic()` after `ensureMicPermission`. |
| `components/layout/ActiveCallSheet.tsx` | Renders the global CallModal across pages; reads from the registry by callId. |
| `components/chat/CallModal.tsx` | UI unchanged; relies on `LiveKitCallClient.{end, toggleMute, decline}`. |

### Env vars (Vercel Production)

- `LIVEKIT_URL` = `wss://localit-tntjqmfu.livekit.cloud` (server-only Secret)
- `LIVEKIT_API_KEY` = `APIPFofWJQgZXeu`
- `LIVEKIT_API_SECRET` = `Re6KZim9ijPUJnpvDTJKB0eXj09TD0NCetan0PJANbxA`

**⚠️ Critical pitfall — wrong API key**: the JWT's `iss` claim MUST
match the API key registered with the LiveKit Cloud project. A wrong
key signs a syntactically-valid JWT but LiveKit's WebSocket returns
`HTTP Authentication failed; no valid credentials available` and
the room never connects. If you swap LiveKit projects (or
regenerate the key), `vercel env rm/add` for all three vars before
redeploying. The token route does NOT validate the key against the
project — that's a LiveKit-side check.

### Why a server-only `LIVEKIT_URL` (not `NEXT_PUBLIC_LIVEKIT_URL`)

The Vercel CLI on PowerShell truncated `NEXT_PUBLIC_LIVEKIT_URL` to
a single character (`y`) when piping the value via stdin. Keeping
the URL server-side and returning it from `/api/livekit/token`
solved the problem and tightened the security model (browser only
ever sees the URL after it's been authenticated).

### What was deleted (2026-10-01)

- `lib/webrtc/webrtc-client.ts` — self-hosted RTCPeerConnection
- `lib/webrtc/signaling-supabase.ts` — Supabase Realtime broadcast signaling
- `lib/webrtc/use-call-quality.ts` — RTCPeerConnection.getStats poll
- `lib/realtime/useBackgroundCallService.tsx` — persistent signaling channel
- `app/api/webrtc/ice-config/route.ts` — STUN/TURN config endpoint
- `BackgroundCallServiceMount` in AppShell (no longer needed; LiveKit
  handles inbound rooms on its server)
- `scripts/playwright-webrtc-smoke.mjs`, `scripts/diag-storage-key.mjs`,
  `scripts/voice-call-rebuild-report.md`

### How to test the new flow

1. Token-only smoke (no mic): `node scripts/livekit-smoke.mjs`
   - Signs in John + Lan, mints tokens, decodes JWTs.
2. Two-way audio test (Playwright + fake mic):
   `node scripts/playwright-livekit-twoway.mjs`
   - Opens /chat for both, John clicks Phone, Lan clicks Accept,
     both reach Connected state, John ends.
   - Screenshots written to `scripts/screenshots/twoway-livekit-*.png`.

### Future work

- **Push notifications** — LiveKit doesn't natively deliver a
  ringing notification when the buddy tab is closed. Pair with
  web-push or a dedicated notification worker.

### Why we replaced Stringee

- Stringee's free trial is **1 month** — not viable for a final-year project that needs to run through grading.
- We owned the SDP/ICE plumbing so the mic permission prompt can be triggered exactly when we want (after the user has clicked Accept), not when the opaque SDK decides.
- The signaling layer is Supabase Realtime broadcast, which is free, durable in the same auth context, and works inside Vercel serverless.

### Signaling protocol

Per-call messages on Supabase Realtime broadcast channel `calls:${userId}`:

- `ring` — caller announces a new ring (durable record lives in `pending_calls`; broadcast is a hint)
- `offer {callId, sdp}` — caller → callee
- `answer {callId, sdp}` — callee → caller
- `ice-candidate {callId, candidate}` — bidirectional
- `bye {callId}` — bidirectional hang-up

### Critical behavior to remember

- **Buddies are reachable on every authenticated page** because:
  1. `IncomingCallWatcher` (DB `pending_calls` subscriber) is in AppShell.
  2. `BackgroundCallService` (Supabase Realtime `calls:${userId}` subscriber) is in AppShell.
  3. `GlobalPresence` (broadcast heartbeat) is in AppShell.
  4. `ActiveCallSheet` (CallModal mount) is in AppShell.
- **DB `pending_calls` stays as the durable source of truth** — same role it plays today. Realtime broadcast is the volatile layer; on reconnect, the client re-subscribes and re-fetches pending rows.
- **The chat page no longer renders its own CallModal** — it owns the WebRTC peer connection (created by `startOutgoingCall`/`acceptIncomingCall`) and forwards state updates to `useActiveCallStore`. The global `<ActiveCallSheet />` reads the store and renders the modal across all pages.

### Presence gate (UI safety)

The Start voice call button in `/chat` is **gated by a layered presence signal** in [app/chat/page.tsx](app/chat/page.tsx):
- `realtimeOnline` — Supabase Realtime `presence-conv-${id}` channel (sub-second, /chat only)
- `heartbeatOnline` — `profiles.is_online` from the DB heartbeat (works on every page because GlobalOnlineHeartbeat updates it)
- `isPartnerOnline = realtimeOnline || heartbeatOnline`

When the partner is offline:
- The button renders `disabled` with `PhoneOff` icon instead of `Phone` and a tooltip "Buddy is offline".
- `startCall()` rejects with `Cannot call: buddy is offline.` before any SDK call.

### Mic permission timing (deferred)

We never call `getUserMedia` until the user has clicked Accept (incoming) or the Phone button (outgoing):

1. Outgoing (`startCall`): prompts BEFORE `startOutgoingCall()`.
2. Incoming (`acceptCall`): prompts AFTER the partner-info lookup but BEFORE `acceptIncomingCall()`.

The helper is `lib/webrtc/mic.ts → ensureMicPermission()`. It returns a cached `MediaStream` on subsequent calls (within the page lifetime) and surfaces typed errors (`MicDeniedError`, `MicNotFoundError`, `MicUnavailableError`) for the UI to render.

### Call UI (CallModal)

`components/chat/CallModal.tsx` is a WhatsApp-style voice-call sheet, unchanged in UX but now driven by our own `RTCPeerConnection` instead of Stringee's opaque SDK:

| State | Visual | Buttons |
|---|---|---|
| `calling` / `ringing` (outgoing) / `connecting` | Avatar with two staggered `animate-call-pulse-ring` rings | `Mute` (disabled until connected) · `Speaker` · `End` |
| `connected` | Quality strip: `SignalHigh/Medium/Low` icon + level label + `bitrateKbps` + `rttMs` (mono font) | `Mute` · `Speaker` · `End` |
| `ringing` (incoming) | Pulsing avatar, green "Incoming call" headline | Big `Accept` (success) · big `Decline` (danger) |
| `declined` | Avatar dimmed + `PhoneOff` overlay, "Call declined" headline | `Close` (auto-dismiss 2.5s) |
| `missed` | Avatar + `PhoneMissed` overlay, "No answer" headline | `Call again` · `Close` (auto-dismiss 3s) |
| `ended` | Avatar dimmed, "Call ended · MM:SS" headline | `Close` (auto-dismiss 1.5s) |
| `failed` | Avatar + `PhoneOff` overlay, error.message | `Close` (auto-dismiss 3.5s) |

Network banner (`bg-warning-bg text-warning`, `Loader2 animate-spin` icon) shows when `navigator.onLine === false` mid-call.

### Live connection quality

`activeCallStore.quality` was previously populated by polling
`RTCPeerConnection.getStats()` every 2s. With LiveKit, the
underlying `Room` already maintains connection-quality metrics
internally (`Room.engine.client.getStats()`) — but exposing those
out of the public SDK is brittle. The CallModal renders the
SignalHigh/Medium/Low icon and duration regardless. If a future
session needs the bitrate/RTT overlay, wire it from a LiveKit
`RoomEvent.ConnectionQualityChanged` listener in
`lib/webrtc/livekit-client.ts`.

### Speaker toggle

`CallModal` exposes a `Speaker` button that calls `audio.setSinkId(...)` on the chat page's hidden `<audio>` element (or the `ActiveCallSheet`'s `<audio>` when navigating away). Chromium-based browsers only.

### How to test a 2-way call

```bash
node scripts/playwright-livekit-twoway.mjs
```

The test opens two Playwright contexts (John = tourist, Lan = buddy),
exercises both directions, and captures screenshots of the
calling / connected / ended states in `scripts/screenshots/`.
It uses `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream`
so it runs headless.

For a token-only check (no Playwright), use `scripts/livekit-smoke.mjs`.

### Common pitfalls

- **"Connection failed" mid-call** (LiveKit): usually means a
  symmetric-NAT network where STUN alone isn't enough. LiveKit
  handles TURN automatically when the project has it configured —
  verify in the LiveKit Cloud dashboard under Settings → TURN.
- **Both peers must be authenticated** for LiveKit to admit them
  into the room. The token route enforces this via
  `supabase.auth.getUser()`. If you see 401, the user's session
  cookie has expired and they need to refresh the page.
- **Mic permission timing**: the chat page prompts AFTER the user
  has clicked Phone / Accept (visible intent). The LiveKit client
  publishes the track AFTER the room is connected, not before, to
  avoid double-prompting the browser.

## Online Presence (2026-09-30 — Phase 1 heartbeat rewrite)

The marketplace had no working auto-presence before this rewrite:
`profiles.is_online` was read by 12+ queries (browse, map, chat,
chat-header, voice-call gate) but was never set automatically.
Tourists logged in and stayed "offline" forever; buddies had a
manual toggle that stuck at "online" after they closed the tab.

### How presence works now (single source of truth = DB)

```
┌──────────────┐                              ┌────────────────────────┐
│ Browser tab  │  mount → RPC(true)          │ public.profiles        │
│ (authenticated)│  heartbeat 30s → RPC(true)│ is_online  last_seen   │
│              │  hidden>5m → RPC(false)    │  ↑           ↑         │
│              │  beforeunload → RPC(false) │  └──── cron job every 5m
│              │  signout → RPC(false)      │  flips rows where      │
└──────────────┘                              │  last_seen < now()-90s │
                                              └────────────────────────┘
```

**RPC `public.set_online_status(p_is_online boolean)`** — `SECURITY
DEFINER`. The client doesn't need direct UPDATE on `profiles`. The
function checks `auth.uid()` and refuses anything else (42501).

**Hook `lib/realtime/useOnlineHeartbeat.ts`** — mounted by
`<GlobalOnlineHeartbeat />` in `AppShell` so it runs on every
authenticated page (not just `/chat`). Responsibilities:
- Mount → `set_online_status(true)`
- Heartbeat every **30 s** while tab is visible
- `visibilitychange` → if hidden, start a 5-min timer; if visible
  again, reset and call `set_online_status(true)` immediately
- `beforeunload` → fetch+keepalive (best-effort)
- `localit-auth-changed` → `set_online_status(false)` + stop
  heartbeat (sign-out path)

**Cron `localit-mark-stale-offline`** — runs `*/5 * * * *` (every 5
min). Calls `public.mark_stale_users_offline()` which flips
`is_online=false` where `last_seen < now() - 90s`. Defensive: catches
browsers that crash, lose network, or never fire `beforeunload`.

**`buddy/dashboard` manual toggle removed.** The presence badge is
now a passive indicator — driven by the heartbeat. Per user
decision on 2026-09-30 (heartbeat-driven, no manual override).

### Phase 2 — Realtime presence channel (2026-09-30 — SHIPPED)

The global Realtime presence broadcast channel is now live. All
authenticated tabs subscribe to `presence-global` and publish their
own `{user_id, is_online, last_seen}` snapshot every 25 s. The store
(`lib/realtime/useGlobalPresence.tsx`) is mounted in AppShell so every
page — including `/map`, `/browse`, `/profile`, etc. — sees
sub-second presence flips.

Hooks:
- `usePresenceOf(userId) → PresenceSnapshot | null`
- `useIsOnline(userId) → boolean`

Components can subscribe via these hooks or read directly from the
module-level cache (no React Context overhead). The chat page's
`isPartnerOnline` gate now combines `realtimeOnline` (Realtime
channel on `/chat`) with `heartbeatOnline` (`profiles.is_online`
from the DB heartbeat), so the phone button enables correctly even
when the realtime channel is empty.

The 30-s polling refresh on `/chat`'s conversations list and `/map`'s
buddies list remains as a safety net for the DB-driven heartbeat.

### How to verify locally

```bash
# 1. Apply the migration (idempotent)
node scripts\apply-migration.mjs supabase\migrations\2026-09-30-online-status-heartbeat.sql

# 2. Run the Playwright presence suite (11 checks)
cmd /c "scripts\run-presence-test.bat"
```

### Vercel alias gotcha (2026-09-30)

⚠️ The canonical aliases `localit-nhattoann.vercel.app` and
`localit-vn.vercel.app` were pointing at a 5-day-old deployment
(manual `vercel alias set` from a previous session). Production
deploys via `vercel --prod --yes` create a new hash URL but do NOT
auto-move the canonical alias. **Always re-point the alias after a
deploy** if you want users to hit the new code:

```bash
vercel alias set <latest-hash>-nhattoann.vercel.app localit-nhattoann.vercel.app
vercel alias set <latest-hash>-nhattoann.vercel.app localit-vn.vercel.app
```

Otherwise tests against the canonical URL hit stale code. Use
`vercel ls --prod` to find the latest hash.

### Callee-side CallModal (2026-09-30)

The callee (`/chat?call=<pendingCallId>`) on accepting an incoming
call MUST see the `CallModal` even if `conversations` haven't
hydrated yet. Two implementation guarantees:

1. `acceptCall()` no longer early-returns when `activeConv` is
   null. It queries `pending_calls` directly via Supabase JS,
   looks up the caller in `safe_profiles` for display info, and
   sets `callPartner` state. This decouples acceptance from the
   conversations list being loaded.
2. `CallModal` is mounted when `callPartner || activeConv` AND
   `callState !== 'idle'` — so even on fresh navigation the modal
   appears.

If `acceptIncomingCall()` fails (no matching Stringee call, etc.)
the modal goes to `failed` state with the error message displayed
beneath the headline and the auto-dismiss timer is **disabled** so
the user has time to read and dismiss manually.

E2E: `node scripts/playwright-callee-test.mjs` — 11/11 pass
against `localit-nhattoann.vercel.app`.

### Future work

- **Background-connect**: mount `IncomingCallWatcher` (or a stripped-down `ensureStringeeClient` + `client.on('incomingcall')`) in a layout-level component (e.g. `app/(authenticated)/layout.tsx`) so buddies are reachable even when they're not on `/chat`. This is the #1 prerequisite for buddy calls to work reliably in production.
- **Push notifications** when the buddy tab is closed (Stringee supports FCM/APNs via their server APIs).

## Session Etiquette

- Always verify the production URL still works at session start (`vercel curl`)
- Keep UI strings in English (target audience for the current Da Nang scope); future i18n work may add Vietnamese as a toggle
- Commit often with conventional commits (`feat:`, `fix:`, `chore:`)
- Update this file as project evolves — single source of truth for cross-session context

## Security Hardening Log (2026-09-26)

A red-team audit ran `scripts/redteam-attack.mjs` against the current production and found (then fixed) the following:

### Critical — fixed
- **🚨 PII leak via anon reads**: tourists/buddies/reviews were publicly readable. Fixed via
  `supabase/migrations/2026-09-26_tighten_rls.sql` (RLS row-level filter on `is_visible=true`/`is_available=true` or `auth.uid()=id`)
  AND `supabase/migrations/2026-09-26_revoke_pii_columns.sql` (column-level grants: anon gets only the
  non-PII columns of tourists/buddies/reviews, and ZERO columns of profiles).
  Anon SELECT on `date_of_birth`, `email`, `phone`, `bio` is now blocked.
- **🚨 verify-otp user enumeration**: 404 vs 410 responses leaked which userIds were real.
  Fixed by collapsing both to a generic `400 {error: "Invalid or expired code.", reason: "invalid"}`
  for unknown userIds, and `410 {error: "No active verification code.", reason: "no_code"}` for
  already-confirmed users. Added IP rate limit (10/min).
- **⚠️ Signup oversized payload**: 50KB `fullName` was silently truncated to 100 chars but the
  request still returned 200. Now returns 400 with explicit message.
- **⚠️ Public pages joining `profiles` directly**: `/map` and `/browse` used
  `profile:profiles(...)` joins — broken under the new "authenticated only" RLS for anonymous
  viewers. Switched to `profile:safe_profiles(...)` which is a view with only id/full_name/role/avatar_url.

### Already fixed before this session
- `autoConfirm` IDOR in `create-profile` — deprecated in favour of one-shot `signupToken` issued by `/api/auth/signup` (5-min TTL, scoped to userId). Cookie-session path still accepted.
- OTP brute force — 5 wrong attempts invalidate the code (`utils/otp.ts`).

### Residual (won't fix in scope — note for future)
- **Per-IP rate limiting is in-memory**: Vercel serverless can spawn multiple lambda instances
  for the same route; each gets its own bucket. An attacker rotating IPs / forcing cold starts
  could bypass the 5/min cap. The current cap stops casual abuse; for real defense-in-depth,
  move to Upstash Redis / Vercel KV (deferred until launch). Documented in the rate-limit util.
- **No CSRF token on `/api/newsletter/subscribe`** — relies on origin/referer check. Acceptable
  for a low-impact endpoint but worth revisiting if newsletter ever sends privileged data.

## Live Map 2-Device Sharing (2026-10-07 — Realtime rewrite)

The "/map" page lets users click "Share my location" to broadcast their
position to nearby tourists on the same map. Two devices, both signed in,
both opted in — should see each other's markers. They didn't, until this
rewrite.

### What was broken
1. **`/map`'s `useLiveUserLocations` hook published over a Supabase
   Realtime `broadcast` channel.** In this project's setup the WS handshake
   completed (status=SUBSCRIBED) but later sends triggered
   `Realtime send() is automatically falling back to REST API` warnings —
   and the REST fallback returned `202` once then `ERR_ABORTED` forever.
   Peers never received the marker.
2. **`location_updates` was missing from the `supabase_realtime`
   publication.** Even after switching the hook to `postgres_changes` on
   that table, no events fired for the receiver because the publication
   only listed `conversations, messages, message_reactions, pending_calls,
   swipes, matches`.
3. **`userIdRef.current` was `null` when the first publish fired.** The
   hook's `getCurrentUser()` resolves asynchronously after the channel is
   created, but `watchPosition` fires almost immediately. The first
   publish was a no-op; subsequent ones worked but the row's `user_id`
   column was missing.
4. **`location_updates` had no UNIQUE constraint on `user_id`** so
   `upsert({ onConflict: 'user_id' })` was rejected. Switched to a
   separate `SELECT` + UPDATE/INSERT.

### The fix (3 migrations + 1 hook rewrite)

| File | Change |
|---|---|
| `supabase/migrations/2026-10-07-location-updates-realtime.sql` | `ALTER PUBLICATION supabase_realtime ADD TABLE public.location_updates` — required for postgres_changes to fan out |
| `supabase/migrations/2026-10-07-location-updates-tourists.sql` | Expand SELECT RLS to authenticated users (rows updated in the last 5 min) — buddies-only was too restrictive for the new tourist→tourist sharing feature |
| `hooks/useLiveUserLocations.ts` | Switch from broadcast to `postgres_changes` on `location_updates`; do a synchronous `sb.auth.getUser()` fallback if `userIdRef` is still null; SELECT-then-UPDATE/INSERT |
| `scripts/playwright-live-map.mjs` | Two Playwright contexts (Lan + John), each clicks Share my location, asserts peerCount≥1 in both directions. 9/9 against the canonical URL |

### How to verify

```bash
node scripts/playwright-live-map.mjs
```

Expected output (truncated):
```
A: peerCount=1, B: peerCount=1
A sees B as peer: YES
B sees A as peer: YES
```

### Operational notes
- Each active sharer writes 1 row per ~5s (`publishIntervalMs`).
  Stale-eviction is client-side (60s default) and server-side (5-min RLS
  cutoff). The `location_updates` table does NOT auto-purge; if many
  users share for hours the row count grows linearly. Acceptable for the
  capstone scope; future cleanup: pg_cron DELETE WHERE updated_at < now() - 1h.
- The hook now does a SELECT-then-UPDATE/INSERT instead of `upsert()`. The
  race is benign because both branches write the same user_id and the
  primary key is the auto-generated UUID.

