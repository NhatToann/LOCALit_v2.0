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

- **Production**: https://localit-ax3tzd5l3-nhattoann.vercel.app/
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

## Database State (as of last session)

- Table `public.test_items` exists with RLS enabled + public-read policy
- 7 rows seeded: id 1-2 from earlier sessions, id 3-7 from latest setup
- Schema: `id SERIAL PK`, `name TEXT NOT NULL`, `created_at TIMESTAMPTZ DEFAULT now()`

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

- PowerShell here-strings need `${env:VAR}` for env interpolation, not `$VAR` (or use `cmd /c` wrapper)
- Vercel **Deployment Protection** may redirect to `vercel.com/login` for fresh browser sessions — login or use a bypass token; `vercel curl` auto-handles this
- Next.js 16 Turbopack builds in ~2s, but first install in cold cache takes ~10s
- Service role key bypasses RLS — never expose in `NEXT_PUBLIC_*` vars or client code
- `vercel env add <NAME>` will error if the name already exists — use `vercel env rm` first

## Next Steps / Roadmap (for future sessions)

When user returns, ask if they want to:

1. Add custom domain (e.g., `localit.app`)
2. Build auth flow (Supabase Auth: email/password, magic link, OAuth)
3. Create domain schema: `tourists`, `buddies`, `trips`, `bookings`, `reviews`, `messages`
4. Implement matching algorithm (tourist preferences ↔ buddy expertise/location)
5. Real-time chat (Supabase Realtime)
6. Image uploads (Supabase Storage)
7. Payments (Stripe)
8. i18n (English primary, Vietnamese secondary — current strings are English; legacy Vietnamese strings were removed in commit before the latest deploy)

## Session Etiquette

- Always verify the production URL still works at session start (`vercel curl`)
- Keep UI strings in English (target audience for the current Da Nang scope); future i18n work may add Vietnamese as a toggle
- Commit often with conventional commits (`feat:`, `fix:`, `chore:`)
- Update this file as project evolves — single source of truth for cross-session context

