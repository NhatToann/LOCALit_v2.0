# Multi-traveler / Multi-buddy Plan — LOCALit

Date: 2026-09-27
Owner: nhattoann
Status: Phase 1 ship-ready (UI + data), Phase 2 in flight

## Why this matters

Today the data model and most call-sites assume **1 tourist ↔ 1 buddy** (1:1 connection, single `trips.buddy_id`, single itinerary owner). Real trips are usually:

- Couples / families travelling together (multi-traveler)
- Group tours with 1 lead guide + 1 local buddy
- Two guides sharing a tourist (food + culture specialists, different days)
- Multiple tourists sharing one guide (group booking)

We need the system to stop pretending 1:1 is the only shape.

## Goals

1. **Data model** — add a group layer that doesn't break existing 1:1 flows.
2. **UI** — show who else is on a trip; let a lead traveler add companions; let a buddy see all travelers and co-buddies on the same trip.
3. **Permissions** — only the lead traveler or a buddy can invite; companions are read-only by default, opt-in for editing the shared itinerary.
4. **Backwards compatible** — every existing 1:1 connection keeps working unchanged.

## Non-goals (Phase 1)

- Payments per traveler (splitting bills in the budget tab — Phase 2)
- Live group chat rooms (Phase 2)
- Auto-matching algorithm (separate roadmap)

---

## Data model

### New tables

```sql
-- Travelers on a trip (the "who is coming" set). Lead traveler is the row
-- where tourists.id = trip.tourist_id; companions are additional rows.
create table public.trip_travelers (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  tourist_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'companion'   -- 'lead' | 'companion'
                check (role in ('lead', 'companion')),
  invited_by  uuid references public.profiles(id) on delete set null,
  status      text not null default 'invited'
                check (status in ('invited','accepted','declined','removed')),
  created_at  timestamptz not null default now(),
  unique (trip_id, tourist_id)
);

-- Buddies assigned to a trip (the "who is guiding" set). Lead buddy is the row
-- where buddies.id = trip.buddy_id; co-buddies are additional rows.
create table public.trip_buddies (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  buddy_id    uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'co-buddy'
                check (role in ('lead', 'co-buddy')),
  invited_by  uuid references public.profiles(id) on delete set null,
  status      text not null default 'invited'
                check (status in ('invited','accepted','declined','removed')),
  created_at  timestamptz not null default now(),
  unique (trip_id, buddy_id)
);
```

### Existing tables stay authoritative for "lead"

- `trips.tourist_id`  — the lead traveler. Always present.
- `trips.buddy_id`    — the lead buddy. Nullable (planning) but set once accepted.
- The new `trip_travelers` / `trip_buddies` tables are **companion registries**.
- The `connections` table keeps tracking **which tourist started a 1:1 chat with which buddy**. A single lead connection is enough for the lead chat. Companion rows can also create conversations later but the MVP keeps a single conversation per trip.

### Backfill migration

For every existing trip with `buddy_id` set:
- insert one row into `trip_buddies` with `role='lead'`, `status='accepted'`, `buddy_id = trips.buddy_id`.
- insert one row into `trip_travelers` with `role='lead'`, `status='accepted'`, `tourist_id = trips.tourist_id`.

This means every existing 1:1 trip gets its lead rows; new companions are added explicitly.

### RLS

```sql
alter table public.trip_travelers enable row level security;
alter table public.trip_buddies    enable row level security;

-- SELECT: anyone who can already see the trip (lead tourist, lead buddy,
-- service_role) can also see the companion lists.
create policy "trip_travelers_read_participants"
  on public.trip_travelers for select
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_travelers.trip_id
        and (t.tourist_id = auth.uid() or t.buddy_id = auth.uid())
    )
    or auth.uid() = trip_travelers.tourist_id   -- a companion sees their own row
  );

create policy "trip_buddies_read_participants"
  on public.trip_buddies for select
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_buddies.trip_id
        and (t.tourist_id = auth.uid() or t.buddy_id = auth.uid())
    )
    or auth.uid() = trip_buddies.buddy_id
  );

-- INSERT: lead traveler / lead buddy can invite companions.
create policy "trip_travelers_invite"
  on public.trip_travelers for insert
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_travelers.trip_id
        and (t.tourist_id = auth.uid() or t.buddy_id = auth.uid())
    )
  );

create policy "trip_buddies_invite"
  on public.trip_buddies for insert
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_buddies.trip_id
        and (t.tourist_id = auth.uid() or t.buddy_id = auth.uid())
    )
  );

-- UPDATE: companions can accept their own invitation.
create policy "trip_travelers_self_update"
  on public.trip_travelers for update
  using (auth.uid() = tourist_id)
  with check (auth.uid() = tourist_id);

create policy "trip_buddies_self_update"
  on public.trip_buddies for update
  using (auth.uid() = buddy_id)
  with check (auth.uid() = buddy_id);
```

### Permissions ladder for the shared itinerary

Today the rule is "lead tourist + lead buddy can edit". After Phase 1:

- **Always can edit** — lead traveler, lead buddy.
- **Always can read** — accepted companions + accepted co-buddies.
- **Can opt in to edit** — companion traveler / co-buddy by accepting an "Editor" invite from the lead. (Phase 2 — out of scope here.)

This keeps the existing `isTourist && isBuddy` check working: it's just expanded to also include "is in `trip_travelers`/`trip_buddies` with status accepted".

---

## UI changes (Phase 1)

### `/itinerary/[connectionId]`

Header now shows **two** avatar stacks:

1. **Travelers** — lead + N companions. Each row: avatar, full name, role tag (Lead / Companion), nationality.
2. **Buddies** — lead + N co-buddies. Each row: avatar, full name, specialty chips.

Add a "Manage travelers" / "Manage buddies" affordance for leads only. The form lets them invite by email (Phase 1 stub: shows "Feature coming soon" if email isn't a registered user yet — same UX as GitHub repo invites when the recipient is new).

### `/buddy/dashboard`

- **Active connections** card replaced by **Active trips**.
- Each trip card shows trip title + 2 avatar stacks (travelers + buddies).
- The "Message" / "Call" buttons target the lead traveler for now (preserves the existing `/chat?buddy=…` link).

### `/tourist/dashboard`

- **Active connections** card → **Active trips** (same shape).
- Companions listed in expanded card view.

### `/buddy/requests`

- Existing "Connection requests" list stays (one row per 1:1 connection).
- New **Find travelers matching you** search section above it:
  - Search box: full-text over tourist interests, languages, destination.
  - Filters: interests, languages, arrival date range, nationality.
  - Each result row: avatar, name, nationality, interests chips, languages, status badge (Searching / Active), "Send connection request" CTA.
- Clicking "Send connection request" creates a `connection` row (status pending) and a `conversation` row. Same flow as today.

---

## Itinerary access fix (independent of the above)

The "inaccessible itinerary" issue has two causes:

1. **404 on seed connectionId** — seed connections belong to test UUIDs, not the logged-in user. The page already returns null in that case but renders a bare "No connection". Fix: if the connectionId doesn't belong to the user, look up the user's most-recent `accepted` connection and redirect (or show a picker with all of the user's accepted connections).
2. **Trip detail link on dashboards** — the dashboard's `Link` points at `connections.id`. If a connection is `declined`, the link 404s. Filter dashboard links to only `accepted` ones.

## Storage RLS fix (independent)

The "new row violates row-level security policy" on avatar upload is the `storage.objects` table blocking writes because we never created a per-user INSERT policy for the `avatars` bucket. Today only the `service_role` can write. Fix: add an INSERT/UPDATE policy that scopes writes to `<auth.uid()>/<filename>`. The buddy profile page already uploads to `${buddy.id}/${ts}.ext`, so the path constraint is enough.

Migration:

```sql
create policy "avatars_user_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_user_folder_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_user_folder_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read stays as-is (bucket is public).
```

For tourist profile avatar (we will add this), the same path scheme applies.

## Map auth-loop fix (independent)

`/map` is missing from the `Cache-Control: no-store` list in `next.config.ts`. Vercel CDN was serving a stale 307 redirect for the previous (logged-out) version of the page. Add `/map/:path*` to the no-cache block.

## Navbar cleanup (independent)

Drop the literal `Profile` link from `NAV_LINKS` for both roles. The avatar dropdown already has **My Profile** → `/buddy/profile` / `/tourist/profile`.

## Tourist Matching & Search (independent)

Built as a new section at the top of `/buddy/requests`. Reads from the public `safe_profiles` view + `tourists` table. Search is full-text over interests/languages/destination. Filters apply via URL query params so the result can be bookmarked/shared. Each row has a "Send request" CTA that goes through `POST /api/connections` (existing route) and shows a toast.

---

## Files touched

| File | What |
|---|---|
| `supabase/migrations/2026-09-27-multi-party.sql` | new — trip_travelers, trip_buddies, backfill, RLS |
| `supabase/migrations/2026-09-27-storage-avatars-rls.sql` | new — storage policies for avatars |
| `next.config.ts` | add `/map/:path*` to no-cache block |
| `components/layout/Header.tsx` | drop `Profile` from `NAV_LINKS` for buddy + tourist |
| `app/itinerary/[connectionId]/page.tsx` | trip header with traveler + buddy stacks; redirect to user's accepted connection if not a party |
| `app/buddy/dashboard/page.tsx` | "Active connections" → "Active trips" with multi-party avatar stacks |
| `app/tourist/dashboard/page.tsx` | same treatment |
| `app/buddy/requests/page.tsx` | new "Find travelers matching you" section above existing list |
| `app/tourist/profile/page.tsx` | add avatar upload section (parity with buddy) |

## Rollout

1. Merge schema + RLS migration first. Apply via `node scripts/apply-migration.mjs`.
2. Verify with `node scripts/check-buckets.mjs` (bucket still exists) + `vercel curl` to the canonical prod URL.
3. UI changes — one PR each, conventional-commits.
4. Final QA: log in as 2 tourists + 2 buddies, send request, accept, share itinerary, add companion. Verify all four participants see the trip in their dashboard.
