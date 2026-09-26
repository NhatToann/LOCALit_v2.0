<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# LOCALit Project Context

> Pre-loaded context for the LOCALit tourist-buddy platform. Read this first in any new session to skip setup steps.

## Project Identity

- **Name**: LOCALit (Kỳ 8 — final-year project)
- **Stack**: Next.js 16.3.6 (App Router, Turbopack) + TypeScript + Supabase (Postgres + RLS) + Vercel
- **Repo**: `D:\1_F_Matierials\Kỳ 8\LOCALit\localit-app` (Windows, PowerShell, git on `main` branch)
- **Owner**: `nhattoann` on Vercel, Supabase project ref `pqvnjgyqbxlylawwogjv`

## Live Endpoints

- **Current Production** (check `vercel ls --prod` — URL changes per deploy):
 `https://localit-menf0nwha-nhattoann.vercel.app/` (deploy 2026-09-26 — redesigned tourist + buddy dashboards with hero, stats, quick actions)
- **Supabase URL**: https://pqvnjgyqbxlylawwogjv.supabase.co
- **Supabase Dashboard**: https://supabase.com/dashboard/project/pqvnjgyqbxlylawwogjv

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

## Database State (as of 2026-09-25)

### Tables & Rows
- `auth.users`: 17 rows (9 seed + 7 test rows from sessions)
- `public.profiles`: 17 rows (FK to auth.users.id)
- `public.tourists`: 4 rows
- `public.buddies`: 12 rows
- `public.connections`, `trips`, `trip_stops`, `conversations`, `messages`, `location_updates`, `reviews` — all present
- All tables have RLS enabled (forced=false)

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

### Email Verification (Custom 6-digit OTP)
- Flow: `/register` → `POST /api/auth/signup-admin` (no auto-confirm, returns userId) → email sent → user lands on `/verify-email?email=...` → enters 6-digit code → `POST /api/auth/verify-otp` → confirms email + upserts profile.
- Codes are bcrypt-hashed in `public.email_verifications` (15 min TTL, 5 attempts, then forced resend via `POST /api/auth/resend-otp`).
- Email delivery: `utils/email.ts` → Resend (`RESEND_API_KEY` + `EMAIL_FROM` env vars). **Without `RESEND_API_KEY`** the sender logs to console / Vercel runtime logs as a stub — useful for local dev or testing without a paid Resend account.
- See `utils/otp.ts`, `app/api/auth/verify-otp/route.ts`, `app/api/auth/resend-otp/route.ts`, `app/verify-email/page.tsx`.

### Data Types (column types differ from what you might assume)
- `tourists.interests`: `TEXT[]` (PostgreSQL array), NOT `jsonb`. Insert with `ARRAY['food','photo']::text[]`
- `tourists.languages`: `TEXT[]`, same
- `buddies.languages`: `TEXT[]`
- `buddies.specialties`: `TEXT[]`
- `profiles.role`: `user_role` enum (`tourist` | `buddy` | `admin`)

### Seed Accounts
- Buddy: `lan.pham@localit.dev` / `password123`
- Tourist: `john.doe@example.com` / `password123`

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
- **Defensive code**: `app/api/auth/create-profile/route.ts` now has a fallback that upserts a `profiles` row if the trigger missed, so the route works even if the trigger is absent.

### Vercel Deployment Protection
- **`vercel env rm` is DANGEROUS without `--yes` confirmation** — the CLI may still prompt but PowerShell eats the prompt and proceeds anyway.
- **Production URLs change per deploy.** The URL `localit-ax3tzd5l3` is stale (no longer aliased). Always get the current URL from `vercel ls --prod` (first line is latest).
- **Node.js `fetch` to production Vercel URL gets 302 → `vercel.com/sso-api`** (Vercel Deployment Protection gate). Use `vercel curl <url>` for programmatic checks, or accept 302 as "reachable but gated" in diagnostics.

### Supabase Auth Sign-Up (500 error)
- Direct `POST /auth/v1/signup` from the Node/pg layer returns `500: Database error saving new user`. This is GoTrue's internal error and happens because the INSERT path to `auth.users` and `auth.identities` goes through Supabase's own gateway, not the postgres role we have access to.
- **Workaround**: Sign-ups via the client-side Supabase JS SDK (`signUp()` in `utils/supabase/auth.ts`) work fine because the SDK calls the GoTrue API directly. Do NOT simulate sign-up via direct pg inserts unless you also insert `auth.identities` and handle the full row schema.
- The `scripts/diag-db-flows.mjs` test inserts into `auth.users` directly (bypassing GoTrue) ONLY for testing FK/trigger integrity. Never use this pattern in production code.

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

## Session Etiquette

- Always verify the production URL still works at session start (`vercel curl`)
- Keep UI strings in English (target audience for the current Da Nang scope); future i18n work may add Vietnamese as a toggle
- Commit often with conventional commits (`feat:`, `fix:`, `chore:`)
- Update this file as project evolves — single source of truth for cross-session context

