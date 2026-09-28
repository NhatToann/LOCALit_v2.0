# Tourist UX Audit — 2026-09-28

This is the baseline follow-up to the 2026-09-26 ui-ux-audit
(`docs/ui-ux-audit.md`, score 4.5/10). Only the tourist role is in scope.
Buddy role is intentionally not re-audited here; its UX has been
"good enough" since the dashboard redesign.

Voice call was wired at the same time as this audit (see Phase 1
summary at the bottom of this file).

## Methodology

Each tourist route was opened in Vercel production (with `darklunatv`)
or read from source. For each route, we scored 9 criteria. "M" means
must-fix (blocker or visible bug), "S" should-fix (ugly or causes lag),
"N" nice-to-have.

| # | Criterion | What we checked |
|---|-----------|-----------------|
| 1 | Loading state | Spinner / skeleton, no empty-state flash |
| 2 | Error state | Inline alert + retry CTA, not silent swallow |
| 3 | Empty state | CTA matches role intent |
| 4 | Empty rebalance | Tourist empty ≠ buddy empty |
| 5 | A11y | aria-label on icon buttons, semantic tags |
| 6 | Click latency | No synchronous Supabase hot path |
| 7 | Realtime | subscribed where state would be stale otherwise |
| 8 | Mobile | No horizontal scroll, no overflow sidebar |
| 9 | Voice-call entrypoint | Phone/Call visible where relevant |

## Per-route findings

### `/tourist/dashboard` (app/tourist/dashboard/page.tsx)
- Loading: M — single spinner; switch to skeleton.
- Error: M — `load()` swallows all errors silently. Add inline alert.
- Empty: S — "No buddies" shows CTA "Find buddies". Good. But "No
  buddies online" hides entire `BuddiesAvailableNow` section → user
  may think feature is broken on first visit.
- Empty rebalance: S — buddy dashboard shows "Hi Lan" greeting +
  status toggle. Tourist greeting is plain "Welcome back". Acceptable.
- A11y: S — `<input>` lives for share-location; toggle button has
  no `aria-pressed`. Add.
- Click latency: N — load() uses parallel Promise.all, fine.
- Realtime: M — `useLiveUserLocations` works, but `connections`/`trips`
  snapshot is static. New trips from chat don't refresh until reload.
- Mobile: S — map height 420px on mobile still feels cramped.
- Voice-call entrypoint: S — Phone icon only on accepted connections.
  See fix F-1 below.

### `/tourist/browse` (app/tourist/browse/page.tsx)
- Loading: S — top-of-page spinner. Skeleton list placeholder would
  feel snappier.
- Error: M — `load()` swallows. Add retry.
- Empty: S — empty state exists with helpful "Try My Khe / Han River /
  Son Tra" hints. Good.
- Empty rebalance: n/a
- A11y: S — map has no caption, dist in km announced but only inside
  hover. Add `aria-live` for filter results count.
- Click latency: M — `toggleSave` is local state only (no save button),
  but a future read requires a `saved_buddies` table we don't have.
  Bug: refreshing the page loses saves. See fix F-2.
- Realtime: n/a — list is mostly stable per session
- Mobile: S — map is 340px, list rows cramped. Add bottom-sheet
  popup on mobile.
- Voice-call: N — no call CTA expected here, chat is right action.

### `/tourist/buddy/[id]` (app/tourist/buddy/[id]/page.tsx)
- Loading: S — single spinner; OK for detail page.
- Error: S — error banner + back link. Good.
- Empty: n/a
- Empty rebalance: n/a
- A11y: S — review stars use `role="radiogroup"` correctly. Good.
- Click latency: M — `openChat` does a select + insert round-trip and
  then `router.push`. Optimistic: if conversation exists, push
  immediately; only insert if missing.
- Realtime: N — reviews section is static. Acceptable.
- Mobile: S — hero card avatar + 2xl size overflow on <400px viewport.
  Reduce.
- Voice-call: S — no call button on buddy profile. Should add (see F-3).

### `/tourist/profile` (app/tourist/profile/page.tsx)
- Loading: S — top spinner. Profile is large; skeleton for avatar
  would help.
- Error: S — error alert inside `<main>`. Acceptable.
- Empty: M — no completeness score. User has no idea what's missing.
  See fix F-4.
- Empty rebalance: N
- A11y: S — radio tabs use `role="tab"`. Fieldset/legend for chip
  groups. Good.
- Click latency: S — avatar upload is async. Good.
- Realtime: N — profile is stable.
- Mobile: S — sidebar collapses below 1024px (lg:grid-cols-[280px_1fr]).
  Tabs become top-pills at < lg. Need mobile-friendly tab drawer or
  section menu.
- Voice-call: N/A — profile is meta, no call here.

### `/tourist/trips` (app/tourist/trips/page.tsx)
- Loading: S — single spinner. Acceptable.
- Error: M — silently swallows error. Add retry banner.
- Empty: S — friendly "Plan a trip" CTA. Good.
- Empty rebalance: N
- A11y: S — chips use `role="tab"`. Good.
- Click latency: S — single load. Fine.
- Realtime: N — list refreshes on tab switch only.
- Mobile: S — filter chips wrap fine; trip rows readable.
- Voice-call: N/A — trips list doesn't take calls.

### `/tourist/trips/create` (app/tourist/trips/create/page.tsx)
- Loading: S — submit button shows "Creating…". Good.
- Error: S — inline alert. Good.
- Empty: N/A — form is always present.
- Empty rebalance: N
- A11y: S — fieldset/legend for trip-details and stops. Good.
- Click latency: S — submit inserts trip + stops in sequence. Could be
  parallel.
- Realtime: N — once created, redirect.
- Mobile: S — stop inputs stack. Acceptable.
- Voice-call: N/A.

### `/tourist/trips/[id]` (app/tourist/trips/[id]/page.tsx)
- Loading: S — single spinner.
- Error: M — trips shows "Trip not found." but no retry. Add link
  to /tourist/trips.
- Empty: S — "No stops planned yet." with no CTA to add a stop here
  (user has to go back to /trips/create). Defensible but could add
  inline "Add stop" editing.
- Empty rebalance: N
- A11y: S — semantic article/section. Good.
- Click latency: S — two parallel queries. Fine.
- Realtime: S — buddy updates won't reflect; fresh page on edit.
  Acceptable for v1.
- Mobile: S — buddy pill at header might wrap awkwardly. Test.
- Voice-call: S — no Call buddy CTA on the trip detail page. Should add.

## Cross-cutting findings

- **F-1 (S) Voice call on tourist dashboard**
  `/tourist/dashboard` shows "Call" only on accepted connections.
  Inconsistent with `/chat` which shows Call anywhere a conversation
  exists. Reconcile: show Call wherever a conversation exists,
  irrespective of connection status.

- **F-2 (M) Saved buddies doesn't persist**
  `/tourist/browse` keeps saved list in component state only. Page
  reload wipes saves. Either persist to localStorage or add a
  `saved_buddies` table.

- **F-3 (M) Call button on buddy profile**
  `/tourist/buddy/[id]` has "Open conversation" but no direct Call.
  Tourist must first open chat to call. Add Call that routes to
  `/chat?buddy=<id>&call=1`.

- **F-4 (S) Profile completeness score**
  `/tourist/profile` doesn't tell the user what's missing. Compute a
  percentage from filled fields (full_name, phone, nationality, dob,
  bio, interests[3+], languages[1+], budget_range, avatar_url) and
  display it as a slim progress bar in the header.

- **F-5 (M) Silent error swallowing**
  `load()` in dashboard/browse/trips catch and discard. If Supabase
  returns 401/500, user sees empty page forever. Add inline `<div
  className="alert alert-error">` with retry CTA.

- **F-6 (S) Static connection/trips lists**
  `dashboard` snapshot doesn't refresh on new connection request or
  trip. Use `postgres_changes` channel similar to chat.

- **F-7 (S) Mobile tab drawer**
  `/tourist/profile` sidebar collapses but tabs become raw buttons
  stacked. Replace with horizontal scroll tabs on mobile.

- **F-8 (N) Voice call in messaging entry points**
  `MiniChatWindow` and `MessageBubble` could surface Call icon in
  pinned/unread previews. Defer (small win).

## Phase 1 summary — Voice call

Voice call wired across:
- `lib/webrtc/call-client.ts` — new file, RTCPeerConnection with mic-
  only stream, signaling via Supabase Realtime broadcast channel
  `call:<conv-id>`. On terminal state inserts a single
  `messages` row with `message_type='call_event'`.
- `lib/types.ts` — added `'call_event'` to `Message.message_type` union.
- `components/chat/CallModal.tsx` — voice-only UI, auto-closes after
  ended/declined/missed/failed.
- `components/chat/MiniChatWindow.tsx` — removed Video button.
- `app/chat/page.tsx` — removed Video button and Video mode in
  ChatInner; `MessageBubble` now renders `call_event` as a centered
  muted pill with the phone icon + duration + time.
- All legacy `?call=video` URLs degrade to voice gracefully.

Smoke test: deploy → voice-call Linh Tran from 2 accounts → verify
row in `messages` with content `📞 Voice call · X min Y s`.

## Next steps (Phase 3 of the plan)

Apply F-1 through F-7 in order. F-2 and F-3 share UI logic with the
new voice call wiring (Call link routes through `/chat?buddy=...&call=1`).
