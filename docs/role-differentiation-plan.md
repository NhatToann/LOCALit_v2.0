# LOCALit — Role Differentiation Plan
## Date: 2026-09-26
## Author: product-strategist subagent

---

## Executive summary

**Current state**

- `app/page.tsx` already auto-routes signed-in users to either `/tourist/dashboard` or `/buddy/dashboard` based on `profiles.role`.
- Tourist side has: dashboard (live map of buddies + trips list + connections list + quick actions), browse page with map + filter chips, full buddy profile with reviews + connection request, trip CRUD, chat.
- Buddy side has: dashboard (4-stat grid + pending requests + upcoming trips + map), requests inbox (accept/decline with auto-create conversation), and a profile editor (4 tabs: profile, specialties/languages, reviews, account).
- Shared surfaces: `/chat`, `/map`, `/login`, `/register`, `/forgot-password`, `/reset-password`, and the global header.
- Header already differentiates top-nav items by role (`NAV_LINKS['buddy']` vs `NAV_LINKS['tourist']` in `components/layout/Header.tsx`) — this is the strongest existing signal.
- Auth flow (3-step register: personal → role → tags & bio) and RLS already enforce the two-role split at the data layer (`profiles.role user_role ENUM`).
- Real-time chat uses Supabase Realtime (`postgres_changes` on `messages`), live map uses `useLiveUserLocations` hook, and the trigger-based PII hardening from the 2026-09-26 red-team pass is now in place.

**Target state**

- A tourist lands on `/tourist/dashboard` and sees *their* primary jobs at a glance: who is available in Da Nang right now, what trips are coming up, who they have an open chat with.
- A buddy lands on `/buddy/dashboard` and sees *their* primary jobs: how many requests are waiting, what this week's earning trajectory looks like, what the calendar looks like, and how to improve their rating.
- The two roles get distinct quick actions, distinct chat affordances (propose trip vs send quote), distinct profile depth (buddy is a public storefront, tourist is a private intake form), and distinct trip-management affordances (tourist edits; buddy executes).

**Gap**

- Dashboards share visual weight equally between tourist + buddy needs, with weak role-specific signal at the top (a hero strip + 4-stat grid is the same for both). The buddy dashboard has no earnings view, no calendar, no profile-completeness score; the tourist dashboard has no "available now" live list, no saved buddies page, no recommendation engine.
- Profiles are differentiated (buddy has specialties + hourly rate + city; tourist has nationality + travel style + interests), but `/buddy/profile` is treated as a private edit form rather than a public storefront, and there is no public "buddy score" / verification concept.
- Chat is identical for both roles (one input box, one send button). No quick actions, no role-specific message templates, no auto-translate, no booking conversion.
- Trips currently only exist in tourist space (`/tourist/trips`, `/tourist/trips/[id]`, `/tourist/trips/create`). A buddy cannot view or update a trip they were assigned to without going through the tourist's URL.
- The Header navbar already shows different links per role, but the hero CTA on `/tourist/dashboard` ("Find buddies / Plan a trip") and `/buddy/dashboard` ("Accepting requests / Edit profile") use the same hero metaphor; a buddy landing on their dashboard should immediately see an availability toggle in the hero, and a tourist should see "where in Da Nang am I" first.

---

## Competitor analysis

### Withlocals (https://www.withlocals.com/)

- **Tourist priorities**: hero search ("Where in the world?" + dates + travellers), category carousel (Food tours, City highlights, Hidden gems), "Meet our locals" featured hosts with photos and one-line taglines, "100% money back" trust strip, reviews as quote-style cards ("Our local showed us the *real* Amsterdam"), low-friction single-product cards with from-price.
- **Buddy ("local host") priorities**: an explicit "Become a host" CTA on every page in the top-right; host landing is a sales funnel emphasising income ("turn your passion into a paycheck"), editorial "stories" page (lonelyplanet-style content the host contributes to), a dedicated host help centre, an "experiences" product page where they fill out guided questions to publish a tour.
- **Key differences**: tourists see products (tours); hosts see products they own (their published experiences). Tourists filter by date + destination + traveller count; hosts filter their inbox by upcoming bookings and earnings. Withlocals uses an editorial layer (host stories) that creates a brand voice tourists can recognise across cities.
- **Lessons for LOCALit**: the homepage should show *products with named hosts*, not a generic buddy grid — even though our data model has buddies + connections + trips, the homepage can promote 3 featured buddies as if they were tour cards. The buddy "Become a host" CTA should be a single persistent button in the public Header when logged-out.

### ToursByLocals (https://www.toursbylocals.com/)

- **Tourist priorities**: city-picker landing ("Where are you going?"), top destinations grid, sample itineraries ("Day in Da Nang"), a "How it works" 4-step explainer with a strong "100% Private Tour" promise, prominent trust badges (BBB, secure checkout), reviews on tour pages rather than host pages.
- **Tour guide priorities**: a clear earnings line on the homepage ("Earn $2,000+ per month guiding"), commission transparency ("we keep 15-20%"), an "Apply now" multi-step form (basic info → location + languages → experience → photos → ID verification → background check), and a knowledge base for established guides.
- **Key differences**: tour guide onboarding is a *flow*, not a form — multi-step with explicit verification gates (photos, ID, background check). This builds trust on both sides and creates a clear "verified" status the tourist can rely on.
- **Lessons for LOCALit**: introduce a buddy verification tier (KYC badge) that the buddy can earn over time, surfaced on the public buddy profile. Add a "Your next 7 days" calendar preview to the buddy dashboard — ToursByLocals guides are expected to keep their availability calendar accurate.

### Airbnb Experiences (https://www.airbnb.com/experiences)

- **Guest priorities**: category browsing (Online Experiences, Food, Animals, History), "Icons" marketing drops, an "Airbnb-friendly apartments" cross-sell, "Recently viewed" personalisation, persistent wishlist, "Reserve now, pay later" trust line.
- **Host priorities**: earnings tracker ("You earned $X.XX last month"), calendar sync, host guarantee up to $1M, "guest standards" educational content, performance metrics (response rate, response time, acceptance rate, cancellation rate, star rating), a "Reservation requirements" panel where the host can require verified ID or a positive review history from guests.
- **Key differences**: the host dashboard is *entirely* about operational metrics (earnings, response time, calendar), while the guest dashboard is about discovery (recently viewed, wishlist). AirBnB treats the two as fundamentally different jobs: the host runs a business, the guest shops.
- **Lessons for LOCALit**: explicitly surface `response_time_minutes` for buddies (computed from message latency over the last 30 days) and `acceptance_rate` (accepted / received requests) as visible stats. The tourist side should have an explicit "Saved buddies" view (the wishlist), even if it starts as a single page.

### GetYourGuide (https://www.getyourguide.com/)

- **Traveller priorities**: "Top sights" curated landing, free-cancellation filter, "Likely to sell out" urgency badges, "Best price guarantee" trust strip, voucher-style confirmation, in-app ticket QR.
- **Supplier priorities**: a separate `supplier.getyourguide.com` portal entirely. Suppliers see bookings, payouts, content-editing for their own listings, customer communication threads, and revenue splits. The supplier UI is dense, tabular, and operational.
- **Key differences**: GetYourGuide runs a *two-app* model — public consumer site and supplier backoffice. This is overkill for LOCALit's scale but the principle is right: tourists browse, suppliers operate.
- **Lessons for LOCALit**: don't try to make `/buddy/dashboard` a public-facing page. It's a *backoffice*. Tourists should never see it; only buddies should ever hit it. We can use a `userRole === 'buddy'` guard at the top of the file to ensure accidental tourist hits redirect.

### Showaround.com (https://www.showaround.com/)

- **Tourist priorities**: "Show me around" verb-led CTA, search by city + date, local-guide profiles with "languages I speak", "things I'm good at", "places I know well", "what I love about my city", and an hourly rate.
- **Local ("showarounder") priorities**: per-request control of availability, accept / decline / counter-offer flows, public profile where they list their city and specialities, earnings tracking.
- **Key differences**: Showaround surfaces the *human story* of the local more than the product. The buddy's profile reads like a personal essay rather than a CV.
- **Lessons for LOCALit**: our buddy `bio` (500 char cap) is the right length to start with, but the buddy profile page (`/tourist/buddy/[id]`) currently buries it under reviews + tags. We should give the bio a dedicated, story-led block above the tags.

### Uber / Lyft (driver vs rider)

- **Rider**: minimal "where to?" screen, payment-method picker, saved places, trip history, promotions, receipts.
- **Driver**: earnings dashboard (daily/weekly/instant-pay), heat-map of demand, acceptance rate, cancellation rate, star rating, online/offline toggle front-and-centre.
- **Key differences**: the driver's primary screen is the *toggle* (go online / go offline) and the secondary screen is earnings. For LOCALit, the buddy's primary screen should be the availability toggle and the secondary screen should be pending requests.
- **Lessons for LOCALit**: the buddy hero already has the "Accepting requests / Currently offline" button, but it's *one of two* CTAs. It should be the *only* primary CTA in the hero — and "Edit profile" should move to the user menu.

### Upwork / Fiverr (freelancer vs client)

- **Client**: project posting form, freelancer search with filters (category, budget, delivery time, rating), saved freelancers, project workspace.
- **Freelancer**: job feed (live list of new postings matching their skills), proposal queue, earnings dashboard, "Rising Talent" badge, profile completeness % score.
- **Key differences**: the freelancer homepage is a *live job feed*, and the dashboard is a *queue of proposals to write*. This is the closest analogue to the buddy's job: react to incoming work fast.
- **Lessons for LOCALit**: the buddy dashboard should treat incoming `connections` (status='pending') as a live queue with first-responder-advantage copy ("Reply within 1 hour — travellers cancel after 3 hours of silence"). And we should add a profile-completeness % score (Upwork-style) that gamifies buddy profile quality.

### Cross-competitor insights

**5 patterns that all mature marketplaces share**

1. **Single primary CTA in the hero per role.** Uber driver: go online. Airbnb host: respond. Upwork freelancer: review proposals. LOCALit should mirror: tourist = "Find buddies", buddy = "Accepting requests" (toggle).
2. **Operational metrics for suppliers.** Earnings, response time, acceptance rate, star rating. Tourists never see these; buddies see them front and centre.
3. **Discovery / saved / wishlist for demand-side users.** Airbnb wishlist, ToursByLocals "favourites", Withlocals "recently viewed". Tourists should have a saved-buddies surface.
4. **Trust signals on supplier profiles that are hard to fake.** KYC badge (ToursByLocals), photo ID (Withlocals), response rate (Upwork). LOCALit currently has *no* trust signal on the public buddy profile beyond aggregate rating.
5. **Calendar as the spine of availability.** All guide marketplaces (ToursByLocals, Withlocals, GetYourGuide supplier) have an availability calendar. LOCALit has only `is_available: boolean` and `is_online: boolean` — too coarse for a real booking flow.

**3 things nobody does well (opportunities for LOCALit)**

1. **Endemic language auto-translate in chat.** Withlocals markets English-speaking guides but Vietnam runs on Vietnamese — every other platform either punts to Google Translate (poor UX) or accepts that language mismatch is a barrier. LOCALit can lean into this with a DeepL/LibreTranslate layer gated behind Supabase Edge Functions, since `messages.content` is stored in `TEXT` and we control the read path.
2. **Role-aware chat affordances.** Every other marketplace treats chat as a single send-box. LOCALit can offer "Propose trip" (tourist) and "Send quote" (buddy) as first-class buttons that pre-fill a trip-draft payload — turning chat into a conversion funnel.
3. **Live presence → discovery.** LOCALit already has `useLiveUserLocations` (see `app/tourist/dashboard/page.tsx` lines 27-30). Buddies who are *physically* in Da Nang right now are the highest-converting match for tourists who arrived this week. No other platform surfaces "in Da Nang right now" as a primary filter — they all default to "available next Tuesday".

---

## Current LOCALit role surface map

### Tourist routes

| Route | What it does today | What it SHOULD do |
| --- | --- | --- |
| `/tourist/dashboard` | Hero (greeting + 2 CTAs), live-map featured strip ("Who's around you right now"), 4-stat grid (Trips / Buddies connected / Pending / Reviews), trips list (top 5), connected buddies list (top 5), quick-actions card. | Hero becomes "Find buddies" + "Plan a trip". Featured map becomes *the* central element with a "Buddies available NOW" sortable overlay. Add an "Upcoming trips" timeline, "Recent conversations" (last 3 threads), and a "Recommended for you" rail (specialties match). |
| `/tourist/browse` | Filter chips (All / Top rated / Near me / Available now), language + destination text inputs, accordion list of buddies with bio / languages / specialties / rate, map of buddies, "Save" toggle, "View profile", "Message". | Add "Response time" filter, "Languages I speak" auto-prefill from `tourist.languages`. Saved buddies persist to `localStorage` (or a `favourites` table — see Phase 2). Add inline calendar preview ("Available next 7 days: ●●●○○●"). |
| `/tourist/buddy/[id]` | Hero card (avatar + name + city + rating + bio + 3-col grid of languages/specialties/rate), reviews list, action card (message + send request + open chat + view location map + contact). | Add "Send quote" (no — that's the buddy's job) and "Propose meeting point" CTA. Show buddy's recent reviews grouped by `trip_stops.destination`. Add "Similar buddies" rail (other buddies matching the same specialties + languages). |
| `/tourist/trips` | List of trips with status badge + date + buddy name + destination gradient header. | Add list / map / calendar view toggle. Filter by status. Add "+ Plan a trip" sticky button. |
| `/tourist/trips/create` | Title, destination (locked to Da Nang), start/end date, notes, dynamic stops list with name/address/notes. | Pre-fill `buddy_id` if user came from a buddy profile (`?buddy=<uuid>`). Add "Share trip plan" → triggers an inline chat message. |
| `/tourist/trips/[id]` | Status badge + title + dates + buddy sidebar card + notes + ordered stops with circle numerals + post-trip review CTA. | Add a "Chat with buddy about this trip" inline thread. Add a map view of stops. Allow the tourist to update status until `confirmed`. |
| `/tourist/profile` | 7-tab editor (personal / preferences / trips / buddies / reviews / interests / account). Same data + change-password + delete-account. | Hide `account` tab behind a small "Settings" link in the user menu. Trim "buddies" tab — replace with real saved-buddies implementation. Add "My privacy" toggle: hide email/phone from buddies by default. |
| `/chat` (shared) | Two-pane: left conversation list, right message thread. Real-time via Supabase Realtime channel per `conversationId`. 1-sec send throttle. | Tourist gets "Propose trip" / "Share meeting point" quick actions; buddy gets "Send quote" / "Share availability". Add an inline "Request booking" → opens `/tourist/trips/create?buddy=<id>`. |

### Buddy routes

| Route | What it does today | What it SHOULD do |
| --- | --- | --- |
| `/buddy/dashboard` | Hero (greeting + availability toggle + Edit profile CTA), 4-stat grid (Pending / Active / Upcoming / Avg rating), pending-requests card (top 5), quick-actions card, upcoming-trips card, location-pin map. | Move "Edit profile" to user menu. Hero becomes single CTA (availability toggle) + a small "View your public profile" link. Replace the stat card "Avg rating" with "This week's earnings". Add calendar preview. Add profile-completeness score. Add "Tourist match suggestions". |
| `/buddy/requests` | Filter chips (All / Pending / Accepted / Declined), 320px min card grid showing tourist avatar + nationality + destination + interests/languages chips + arrival date + Accept/Decline buttons; on Accept, creates a conversation row. | Add a sort (newest / soonest arrival). Show "Reply urgency" badge if the tourist's arrival date is < 7 days away. Show the tourist's prior reviews *from other buddies* in an expandable panel. Allow counter-offer (custom message + alternate rate). |
| `/buddy/profile` | 4-tab editor (profile / specialties+langs / reviews / account). Edit hourly_rate, bio, languages, specialties, is_available, name, phone. Read-only city (Da Nang). | Add "Public profile preview" button → opens `/tourist/buddy/<my-id>` in a new tab. Add profile-completeness meter (% filled). Add a "Public profile" tab that mirrors `/tourist/buddy/[id]` exactly. Add calendar management tab (Phase 2). |
| `/chat` (shared) | Same two-pane as tourist. No role-specific affordances. | Buddy gets "Send quote" (prefills a structured message with hourly_rate + duration) and "Share availability" (sends a calendar snippet) and "Convert to booking" (creates a `trip` from the conversation). |
| (missing) `/buddy/trips` | None — buddies see their trips as a slice of `/tourist/trips/[id]`. | Add `/buddy/trips` showing only trips where `trips.buddy_id = auth.uid()`, with the buddy's available actions (mark confirmed → in-progress → completed, send trip summary). |
| (missing) `/buddy/earnings` | None. | Add `/buddy/earnings` showing this week / month / all-time revenue from completed trips, computed from `trips.buddy_id` joined with `trips.start_date` and a `hourly_rate` snapshot. Phase 2. |

### Shared routes (allowed to be similar)

- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` — single form per route; identical UI for both roles.
- `/profile` (basic fields) — the inner-form contents differ (we keep `/tourist/profile` and `/buddy/profile` as separate URLs because the data shape is too different to share cleanly), but the shell and account-settings tab are reusable.
- `/map` — public. Works for both roles. Tourists use it to discover buddies; buddies use it to verify their pin.
- `/chat/[conversationId]` — works for both, but role-specific quick actions differ (see Differentiated feature proposals → C. Chat).
- `/chat` (conversation list) — works for both, but the "partner" labelling differs (the buddy sees a tourist's name + arrival date; the tourist sees a buddy's name + city + hourly_rate).

---

## Differentiated feature proposals

### A. Matching & Discovery

**Tourist side**

- Browse buddies by: specialty, language, location, ratings, response time (`buddies.response_time_minutes` — derived), price band, availability (`is_available` AND `is_online`), and the new "in Da Nang right now" filter (uses `location_updates.updated_at` recency).
- "Available now" filter (already partially implemented at `/tourist/browse`) should also surface buddies who have updated their `location_updates` in the last 30 min — not just `is_online`.
- View buddy: bio, photo, specialties, languages, hourly rate, ratings, sample reviews, calendar (next 7 days — Phase 2).
- Save favourite buddies — persist to `public.favourites` table (`tourist_id`, `buddy_id`, `created_at`) so saved buddies survive across devices. Currently it is local-state only (`useState<string[]>([])` in `app/tourist/browse/page.tsx` line 61).
- Send connection request with proposed trip outline (currently message-only at `app/tourist/buddy/[id]/page.tsx` line 280-301). Add fields: `proposed_date`, `duration_hours`, `pickup_location`.

**Buddy side**

- See incoming requests (already at `/buddy/requests`).
- View tourist profile: nationality, interests, planned dates (`arrival_date`), group size (we don't capture today — add `party_size` to tourists in a future migration), languages they speak, bio, prior reviews from other buddies (we don't surface this — add `reviews.reviewer_id` join).
- Decide: accept / decline / counter-offer. Counter-offer flow: pre-fills a new `connections` row with a `counter_offer: jsonb` field containing `{proposed_rate, proposed_hours, message}`. **Requires schema change** — note for Phase 2.
- Show portfolio: previous trips led (`trips WHERE buddy_id = me AND status = 'completed'`), areas of expertise (`buddies.specialties`), certifications (we don't capture — Phase 3).
- Toggle availability (`is_available` + `is_online`) — already partially in `/buddy/dashboard`.
- Set hourly rate + minimum booking hours — currently `hourly_rate` exists but no `min_hours`. **Add `buddies.min_hours INTEGER NOT NULL DEFAULT 2`** in a future migration.

### B. Dashboard personalisation

**Tourist dashboard** (already has featured map; add)

- "Buddies available NOW in Da Nang" — sorted by live location recency (`location_updates.updated_at DESC LIMIT 10`). Today the dashboard shows a map, not a list.
- "Recommended for you" — buddies matching `tourist.interests ∩ buddies.specialties` (Jaccard similarity) ranked by `rating_avg DESC`.
- Upcoming trips timeline — currently a flat list; convert to a vertical timeline grouped by week.
- Recent conversations — 3 most recent `conversations WHERE tourist_id = me ORDER BY updated_at DESC`.
- Past trip memories / photos — Phase 3 (need a `trip_photos` storage bucket first).

**Buddy dashboard** (already has map; add)

- Earnings summary (this week / this month). Requires a derived view over `trips.buddy_id` joined with a `bookings` or `trip_payments` table — that table does **not** exist today. Defer earnings to Phase 2 and surface only completed-trip count + total hours as a placeholder.
- Pending requests count badge — already at `pendingCount`.
- Calendar view of upcoming bookings — Phase 2.
- Average response time metric — derive from `messages` (`created_at` of first response after a `connection` becomes `accepted`).
- Profile completeness score — count of: avatar_url, bio ≥ 50 chars, ≥ 1 specialty, ≥ 1 language, hourly_rate > 0, location_city set, is_online = true. Display as a percentage with a "Complete your profile" CTA when < 80%.
- Tips to improve rating — context-aware copy: "Add 2 more photos" if no avatar; "Tourists filter by English — add English to your languages" if `languages.length < 2`; etc.
- Tourist match suggestions — tourists in Da Nang whose `tourists.interests` overlap with the buddy's `specialties` and whose `arrival_date` is in the next 14 days. Display as a horizontal rail on the dashboard.

### C. Chat differentiation

**Tourist chat**

- Tone: planning & friendly.
- Quick actions: "Share trip plan" (inserts a trip card), "Propose meeting point" (opens a mini-map picker that posts lat/lng + name), "Send map pin" (inserts a `messages.metadata = {type:'map_pin', lat, lng, label}` so the chat bubble can render a Leaflet preview).
- Inline trip itinerary sharing: the buddy can paste a JSON snippet of `trip_stops` that renders as a tappable itinerary card.
- "Request booking" button → opens `/tourist/trips/create?buddy=<id>` with the buddy pre-selected.

**Buddy chat**

- Tone: professional.
- Quick actions: "Send quote" (a structured card: hours × rate = total), "Share availability" (sends a 7-day calendar snippet as a card), "Request deposit" (Phase 3, requires Stripe).
- Inline availability calendar — a small 7-day grid showing busy/free based on the buddy's `buddy_availability` table.
- "Convert to booking" button → creates a `trips` row from the conversation's history (uses the most recent proposed dates / duration from the chat metadata).
- Auto-translate if tourist's profile language differs from buddy's — Phase 3 (Supabase Edge Function + DeepL or LibreTranslate). Today the messages are stored verbatim.

### D. Trip management (already shared; refine)

**Tourist**

- Create trip → assign buddy (optional, via `?buddy=<id>`) → invite co-travelers (we don't have multi-traveller — Phase 3).
- Status: Draft → Planned → Confirmed → In Progress → Completed → Reviewed. We currently have `planning / confirmed / completed / cancelled`. **Add `in_progress` to the `trip_status` enum** in a future migration.
- View: list view + map view + calendar view (today: list only).
- Edit trip until confirmed — RLS already allows owner updates; UI doesn't surface "edit" button. Add inline edit.

**Buddy**

- View all trips where I'm the guide (no edit on the tourist's content). RLS already permits buddy-side updates; UI doesn't exist.
- Update trip status: Confirmed → In Progress → Completed. **Build `/buddy/trips`**.
- Send trip summary at completion — a `messages` row with a card showing the trip's stops + photos.
- See earnings per trip — placeholder until Phase 2 earnings dashboard.

### E. Profile differentiation

**Tourist profile** (`/tourist/profile`)

- Nationality, languages I speak, travel style (foodie/adventurous/etc), interests — already captured.
- Privacy: hide email/phone by default; only matched buddies see contact info. **Today** email is in `profiles.email` and is locked-down by RLS (`REVOKE SELECT ON profiles FROM anon`). We can tighten further: only show email to buddies with a row in `connections` where `status = 'accepted'`. Phase 1 hardening.
- Past trip count + countries visited — derive from `trips WHERE tourist_id = me GROUP BY destination`.

**Buddy profile** (more public)

- Avatar + gallery (up to 6 photos) — Phase 3 (Supabase Storage).
- Hourly rate + minimum hours — already have hourly_rate; add min_hours in Phase 1.
- Specialties (chips) + languages + certifications — already have specialties + languages; certifications need a new table.
- Bio (longer) — already have `buddies.bio` 500 chars.
- Response time (avg over last 30 days) — derive from messages, surface on public profile.
- Verification badge (if KYC'd) — add `buddies.verified_at TIMESTAMPTZ` column; set via an admin tool after KYC.
- Public visibility: anyone can see buddy profiles; only matched buddies can message. **Today** the public `/tourist/buddy/[id]` page shows the buddy to anyone, including logged-out visitors — we should ensure it doesn't require auth, but only show contact details after a `connections.status = 'accepted'` row exists.

---

## Implementation roadmap (priority order)

### Phase 1 — Visible wins (1 week)

1. Differentiated navbar items per role — *already done* (`components/layout/Header.tsx` line 15-34). Verify the buddy navbar doesn't surface tourist-only links in a regression sweep.
2. Tourist dashboard "Available now" section — add a `BuddiesAvailableNow` card to `app/tourist/dashboard/page.tsx` that queries `buddies.is_available = true` AND `profiles.is_online = true` ORDER BY `location_updates.updated_at DESC NULLS LAST` LIMIT 5.
3. Buddy dashboard earnings summary card — placeholder version: "X trips completed this month · Y total hours guided" derived from `trips WHERE buddy_id = me AND status = 'completed' AND start_date >= date_trunc('month', now())`.
4. Differentiated quick actions in chat — at `app/chat/page.tsx`, render the message input row with role-specific quick-action buttons. Tourist: "Propose trip / Share meeting point". Buddy: "Send quote / Share availability".
5. Role-aware footer (sign in as: tourist OR buddy, with different marketing copy). Update `components/layout/Footer.tsx` so the CTA section branches on `userRole`.

### Phase 2 — Discoverability (2 weeks)

6. Buddy profile completeness score (gamified) — new helper in `utils/profile-completeness.ts` returning a 0-100 number; render a meter on `/buddy/profile` and on `/buddy/dashboard`.
7. Tourist "saved buddies" page — new table `public.favourites (tourist_id UUID, buddy_id UUID, created_at TIMESTAMPTZ, UNIQUE(tourist_id, buddy_id))`; add `/tourist/saved` route; replace the local `useState<string[]>` in `app/tourist/browse/page.tsx`.
8. Buddy availability calendar component — new table `public.buddy_availability (buddy_id UUID, day DATE, slots TEXT[])`; new component `components/buddy/AvailabilityCalendar.tsx`; render on `/buddy/profile` (manage) and `/tourist/buddy/[id]` (read).
9. Match-suggestion engine on both dashboards — server-side helper `utils/match.ts` returning up to 10 suggestions per role. Tourist: buddies overlapping specialties. Buddy: tourists overlapping specialties within arrival window.
10. Inline trip-itinerary sharing in chat — extend `messages.metadata JSONB` (column already implicit; add explicit column via migration `supabase/migrations/2026-09-27_add_messages_metadata.sql`). When a tourist sends a trip-share, the bubble renders a `<TripCard trip={...} />`.

### Phase 3 — Trust & conversion (3 weeks)

11. Earnings dashboard for buddy (with charts) — `/buddy/earnings` with a simple bar chart of weekly earnings; uses Chart.js via dynamic import to avoid SSR issues. Data from `trips.buddy_id = me AND status = 'completed'` joined with `buddies.hourly_rate * trip_duration_hours`.
12. Buddy verification badge system — `buddies.verified_at TIMESTAMPTZ`; admin tool at `/admin/verify/<buddy-id>`; KYC badge component on public buddy profile.
13. Tourist past-trip memories / photos — Supabase Storage bucket `trip-photos`; RLS restricted to trip participants; `/tourist/trips/[id]` gets a photo grid.
14. Auto-translate in chat — Supabase Edge Function `translate-message` calls DeepL (or LibreTranslate as fallback); translate on read if tourist.buddy language pair differs; store translation in `messages.translated_content JSONB`.
15. Trip status flow with buddy-driven transitions — add `in_progress` to `trip_status` enum; add `/buddy/trips` route; buddies can advance status from confirmed → in_progress → completed.

---

## Concrete next actions (this session)

The implementing agent should pick up these five specific changes first:

1. **`app/tourist/dashboard/page.tsx`**: add a `BuddiesAvailableNow` card (query `buddies` + `safe_profiles` join filtered on `is_available=true AND is_online=true ORDER BY location_updates.updated_at DESC NULLS LAST LIMIT 5`); render as a horizontal scroller between the featured map and the stat grid.
2. **`app/buddy/dashboard/page.tsx`**: replace the "Avg rating" stat card with an "Earnings this month" placeholder card (count of completed trips + sum of hours × hourly_rate over the current calendar month). Move "Edit profile" out of the hero into the user menu (Header already renders the user avatar — pass a "Profile" link there).
3. **`app/chat/page.tsx`** (and `app/chat/[conversationId]/page.tsx`): detect `myProfile.role === 'tourist' | 'buddy'` after the conversation loads, and render role-specific quick-action chips above the input row. Tourist: `[📍 Propose trip] [🗺️ Meeting point]`. Buddy: `[💵 Send quote] [📅 Availability]`. No schema change required for v1 — these are just templates that prefill the message input.
4. **`app/page.tsx`** (homepage hero): change the "Buddies online now" section header from a flat buddy-card grid to "Featured buddies in Da Nang" using the existing `safe_profiles` join (already done at lines 86-109) — add a third-card rail and a tagline emphasizing the live-availability signal.
5. **`lib/types.ts`**: extend the `Buddy` and `Profile` types with the optional fields we'll need in Phase 2 (this is the type-only change that unblocks the rest): add `min_hours?: number` and `response_time_minutes?: number` to `Buddy`; add `verified_at?: string | null` to `Buddy`. These can be wired to actual columns later without breaking call sites.

