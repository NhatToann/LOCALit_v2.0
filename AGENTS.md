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
  `https://localit-7860e6b8u-nhattoann.vercel.app/` (deploy 2026-09-25)
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

