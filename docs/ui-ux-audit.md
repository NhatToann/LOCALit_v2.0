# LOCALit UI/UX Audit — 2026-09-26

> **Auditor:** Senior Product Designer (Cursor subagent)
> **Scope:** All public + authenticated surfaces (anon, tourist, buddy)
> **Live URL tested:** https://localit-vn.vercel.app
> **Browser:** Cursor MCP browser (Chromium-based)
> **Method:** Live navigation, accessibility snapshots, full-page screenshots, source-code review

---

## Executive summary

- **Overall score: 4.5/10** — Functionally complete, structurally sound, but visually *amateur*. The design system exists (`app/globals.css`) but is undermined by an emoji-as-icons culture, a heavy footer that drowns every page, three inconsistent navigation states, and no real photography on a marketplace that lives or dies by trust.
- **Top 3 strengths**
 1. A coherent design-token system (Poppins + Plus Jakarta Sans, `--primary: #FF6B35` orange, consistent 8px spacing scale).
 2. Honest role-aware information architecture: tourist and buddy dashboards split correctly, RLS-safe `safe_profiles` joins, account menu differentiates by role.
 3. Solid mobile responsiveness — every page collapses to a single hamburger nav cleanly, no horizontal scroll.
- **Top 5 issues** (priority order)
 1. **Emoji icons everywhere** (≈60 distinct emoji across 23 files) make the product feel like a 2014 MVP, not a tourism marketplace. The `Header.tsx` logo alone uses 🌍.
 2. **Footer weight problem** — the dark footer takes 30–50% of every page's first viewport. On a marketplace, the CTA should be above the fold; the footer is below the hero.
 3. **No real photographs** — `BuddyCard.tsx` falls back to a single initial letter in a generic gradient hero; no avatars, no destination photos. Compare Withlocals or Airbnb where every card has a real face.
 4. **Navigation inconsistency** — three different `NAV_LINKS` arrays (`guest`/`tourist`/`buddy`) with 3–5 items each, plus the `/register` page uses a totally different `Header` (just `L` logo + Sign in link) which is jarring.
 5. **Trust signals are missing** — no verification badges on buddy profiles, no response-time SLA, no "X tourists traveled with this buddy", no review count on buddy cards, no safety/insurance cue. For a marketplace that matches strangers for travel, this is the single biggest UX gap.

---

## Icon set assessment

### Current state: emoji-based

Counted across the codebase (`grep` over `app/` and `components/`):

| Emoji | Where used | Semantic |
|---|---|---|
| 🌍 | Header logo, Footer logo, Homepage CTA, Buddy dashboard eyebrow | Brand mark |
| 🗺️ | Browse, Map, Trip detail (Itinerary), Quick action cards | Map / navigation |
| 📍 | Browse filter, Buddy cards, Map marker, Trip stops, Dashboard | Location / pin |
| 💬 | Quick actions, Chat link, Buddy detail CTA | Messages / chat |
| 👤 | User menu, Buddy connection, Profile | User |
| ⭐ | Rating, Reviews, Stars | Star rating |
| 🔍 | Quick action "Find buddies" | Search |
| 🟢 | Buddy availability badge | Online status |
| ✏️ | Quick action "Edit profile" | Edit |
| 📨 | Quick action "Review requests" | Inbox / requests |
| ✓ | Status badges (Connected, Saved, Confirmed) | Success |
| ✕ | Close button, Decline | Cancel / close |
| ⏳ | Status badges (Pending, Planning) | Waiting |
| ➕ / ＋ | "Plan a trip", "Add stop" | Add / new |
| 🧳 | Dashboard hero ("Tourist dashboard"), Stat tile | Tourist identity |
| 🛍️ | Register interest picker | Shopping |
| 📷 | Register interest picker | Photography |
| 🏖️ | Register interest picker | Beach |
| 🏔️ | Register interest picker | Nature |
| 🍜 | Register interest picker | Food |
| 🏛️ | Register interest picker | History |
| ⚠️ | Error alerts, Location off | Warning |
| 🔒 | "Change password", "We never share" | Security |
| ✈️ | Tourist profile empty state | Travel |
| 🎒 / 💑 / 👥 / 👨‍👩‍👧 | Travel style picker | Solo / Couple / Friends / Family |
| ● | Online badge (BuddyCard) | Availability dot |
| ♡ | "Save" favourite toggle | Heart / favourite |

**Total distinct emoji used as icons: ~26, across 23 files.**

### Why this is a problem

1. **Cross-platform inconsistency.** 🌍 renders as the Earth symbol in Segoe UI Emoji (Win), as 🌎 in Twitter Emoji (Twemoji), and as a green-and-blue globe in Apple. A user on iOS sees a colourful emoji; on Android they see a flat one. Brand coherence dies here.
2. **No two-color state.** Status icons (✓, ✕, ⏳) cannot be tinted by hover / active / error state — they are monochrome glyphs the OS draws. The `success` color token exists but cannot be applied.
3. **Accessibility.** Screen readers pronounce "🌍 Local Buddy" as "Earth globe Local Buddy" — embarrassing. `aria-label` should override this but the codebase mixes `aria-hidden="true"` with bare emoji, so the experience is unpredictable.
4. **Weight and rhythm.** Emoji are roughly the size of body text (16–18px), which means the "icon" never reads as more important than the text beside it. Compare Lucide icons at 20–24px that *look* like UI.

### Recommended icon library

**Pick: Lucide React (`lucide-react`)**.

Reasons:
- **Tree-shakeable.** Only imports the glyphs you use — bundle stays small. Heroicons and Tabler ship similar APIs; Lucide's npm package is currently the most actively maintained (3.x in 2026).
- **Consistent stroke language.** All Lucide icons are 24px, 2px stroke, round caps, single colour — so the icon set "feels like one family". This matches the existing design system, which is also single-colour-on-tinted-bg.
- **Semantic names map cleanly to the existing emoji:** `Globe`, `Map`, `MapPin`, `MessageCircle`, `User`, `Star`, `Search`, `CircleDot`, `Pencil`, `Inbox`, `Check`, `X`, `Hourglass`, `Plus`, `Briefcase`, `ShoppingBag`, `Camera`, `Beach` (umbrella-beach), `Mountain` (mountain-snow), `UtensilsCrossed`, `Landmark`, `AlertTriangle`, `Lock`, `Plane`, `Backpack`, `Heart`, `Users`.
- **TypeScript-first.** Every icon is a typed component, so the refactor can be `grep`-driven.
- **Used by Vercel, Linear, Cal.com, Plausible** — the same demographic as LOCALit.

If the team prefers a slightly chunkier look: **Phosphor Icons** (`@phosphor-icons/react`) — same tree-shake model, with 6 weights (Thin / Light / Regular / Bold / Fill / Duotone). The `Fill` weight maps perfectly to "active nav item".

### Migration scope (every emoji → Lucide)

| File | Current | Replacement |
|---|---|---|
| `components/layout/Header.tsx` | 🌍 logo, 👤, 🔍, 🚪 | `Globe`, `User`, `Search`, `LogOut` |
| `components/layout/Footer.tsx` | 🌍 logo | `Globe` (also replace the inlined Twitter/Instagram/FB/LinkedIn SVG with `<Twitter />`, `<Instagram />`, `<Facebook />`, `<Linkedin />` from Lucide) |
| `app/page.tsx` | 📍, 📅, 🔍, 🧳, 🌍, ⭐ | `MapPin`, `Calendar`, `Search`, `Briefcase`, `Globe`, `Star` |
| `app/tourist/dashboard/page.tsx` | 🧳, ⏳, ⭐, 🔍, ＋, 📍, 👤, ✓, ✕, 💬, 🧳 (empty), 🗺️ | `Briefcase`, `Hourglass`, `Star`, `Search`, `Plus`, `MapPin`, `User`, `Check`, `X`, `MessageCircle`, `Briefcase`, `Map` |
| `app/buddy/dashboard/page.tsx` | ⏳, ✓, 🧳, ⭐, 🌍 (eyebrow), 🟢, ⚪, ✏️, 📨, 💬, 📍, ✓, 👤 | `Hourglass`, `Check`, `Briefcase`, `Star`, `Globe`, `CircleDot`, `Circle`, `Pencil`, `Inbox`, `MessageCircle`, `MapPin`, `Check`, `User` |
| `app/tourist/browse/page.tsx` | 🗺️, 📍 (×3), ✕, ⭐ (×2), ✓, ♡, 💬 | `Map`, `MapPin`, `X`, `Star`, `Check`, `Heart`, `MessageCircle` |
| `app/tourist/buddy/[id]/page.tsx` | ⚠️ (×2), 📍, ⭐ (×2), ⏳, ✕, 💬 | `AlertTriangle`, `MapPin`, `Star`, `Hourglass`, `X`, `MessageCircle` |
| `app/tourist/trips/[id]/page.tsx` | 📍 (×2), 📅, 🗺️, ⭐ | `MapPin`, `Calendar`, `Map`, `Star` |
| `app/tourist/trips/page.tsx` | ➕, 📍, 📅, 👤 | `Plus`, `MapPin`, `Calendar`, `User` |
| `app/tourist/trips/create/page.tsx` | ➕, ✓ | `Plus`, `Check` |
| `app/tourist/profile/page.tsx` | ✓, ⚠️, 🎒/💑/👥/👨‍👩‍👧, ✈️, 🔍, 🔒 | `Check`, `AlertTriangle`, `Backpack`/`HeartHandshake`/`Users`/`UsersRound`, `Plane`, `Search`, `Lock` |
| `app/buddy/requests/page.tsx` | ⏳, ✓, ✕ | `Hourglass`, `Check`, `X` |
| `app/buddy/profile/page.tsx` | ✓, ⚠️, 📍, 📅, 👤, ⭐ | `Check`, `AlertTriangle`, `MapPin`, `Calendar`, `User`, `Star` |
| `app/map/page.tsx` | 📍 (×4), ⚠️, ✕, 🗣️, 💬 | `MapPin`, `AlertTriangle`, `X`, `Languages`, `MessageCircle` |
| `app/chat/page.tsx` | 💬 | `MessageCircle` |
| `app/register/page.tsx` | 🍜, 📷, 🏛️, 🏖️, 🏔️, 🛍️, 🧳, 🌍, 🔒, ⚠️ | `UtensilsCrossed`, `Camera`, `Landmark`, `UmbrellaBeach`, `MountainSnow`, `ShoppingBag`, `Briefcase`, `Globe`, `Lock`, `AlertTriangle` |
| `components/buddy/BuddyCard.tsx` | 📍, ●, ★ (filled), ♡ | `MapPin`, `CircleDot`, `Star` (Lucide has filled star), `Heart` |
| `components/map/MapView.tsx` | 📍 (×2) | `MapPin` |

**Estimated effort:** ~80 emoji replacements across 18 files. Mechanical refactor — perfect for an intern or one PR.

### Install + setup

```bash
npm install lucide-react
```

Add a tiny `components/ui/Icon.tsx` wrapper if you want consistent size:

```tsx
import { type LucideIcon } from 'lucide-react'
export function Icon({ icon: I, size = 20, ...props }: { icon: LucideIcon } & React.SVGProps<SVGSVGElement>) {
  return <I size={size} strokeWidth={2} {...props} />
}
```

Then everywhere `🧳` becomes `<Icon icon={Briefcase} />`. Bundle impact is negligible because Lucide tree-shakes per icon.

---

## Page-by-page audit

### 1. Homepage `/` (anon, `?home=1`)
- **Score: 5/10**
- **Visual hierarchy**: Hero has tagline + 2 CTAs ("🔍 Find Buddy", "🧳 I'm a tourist", "🌍 I'm a local buddy") above-the-fold but they're a flat row of outline + primary buttons. No hero image, no gradient, no value-prop headline. The "Featured destinations" grid uses 4 Unsplash photos at the same scale (good consistency) but the rating `⭐ 4.9` chip is barely visible against the photo.
- **Typography**: Poppins base, body ~16px (matches `--font-size-base`). H1 appears to be ~36–40px. Section headings ~24px. The hero CTA buttons feel like body text, not CTAs.
- **Navbar**: `guest` config — Home / Buddies / Map. Plus "Sign in" (outline) + "Sign up" (primary) on the right. On mobile, hamburger menu icon (three-line SVG — *good*, the only place a real icon exists). The logo is `🌍 LOCALit` — emoji right beside the brand name is the first thing users see.
- **Icons used**: 📍, 📅, 🔍, 🧳, 🌍, ⭐
- **Issues**:
 1. The footer is enormous — dark, full of links, with a newsletter form. On the homepage it competes with the actual value prop.
 2. Hero has no photograph — a tourism marketplace with no photo above the fold signals "template".
 3. Featured destinations grid: the Unsplash URLs (`?w=600&h=400&fit=crop`) are hard-coded. The destination card is a fixed-size div with `border-radius: 16px`, photo, rating, "→" link. Looks dated.
 4. No social proof — no "500+ travelers" counter, no "5.0★ from 23 reviews" strip.
- **Recommended fixes (code-level)**:
 - Add a hero photo (`bg-image: linear-gradient(...) + url(unsplash)`) with white text overlay.
 - Replace 🧳 / 🌍 CTAs with `<Icon icon={Briefcase} />` / `<Icon icon={Globe} />` sized at 20px next to 16px text.
 - Add a single trust strip below the CTAs: `5.0★ average · 12 verified buddies · 87 trips guided`.
- **Screenshot**: `01-homepage-anon.png`

### 2. Anonymous browse `/tourist/browse` (anon redirects to `/login`)
- **Score: 5/10**
- The middleware correctly redirects anon users to login (`redirectTo=%2Ftourist%2Fbrowse`). Good. But the *intent* of "browse without an account" is a standard pattern for marketplaces — see Withlocals where you can browse before signing up.
- **Recommended fix**: Allow anon to see buddy cards (de-identified view), prompt to sign up before messaging. Add `?preview=1` or check `is_visible=true` to filter what anon sees.
- **Screenshot**: `02-tourist-browse.png` (redirected to login)

### 3. Anonymous buddy detail `/tourist/buddy/66666666-...`
- **Score: 5/10**
- Same redirect-to-login behaviour. The page itself (when authed) shows: avatar, name, location, rating, specialties, languages, hourly rate (formatted as `$X/giờ` — Vietnamese + currency mixed, see issues below), bio, reviews (0), connection request form, map.
- **Issues**:
 1. **"giờ" appears in English-language UI** — `BuddyCard.tsx:66`: `${props.hourly_rate}/giờ`. Other places use "hr" or "hour". Inconsistent.
 2. Reviews section is empty — `Reviews ( 0 )` with "No reviews yet." A marketplace with 0 reviews on most profiles signals "no one has used this". Need at least 3 seed reviews per buddy.
 3. The buddy's photo is a coloured circle with the initial letter (see `BuddyCard.tsx:30`) — there's no real avatar fallback (e.g. DiceBear `identicon`, or Unsplash with `?seed=name`).
 4. "Hourly rate" is the only commercial signal — no per-day, per-half-day, per-group options. Withlocals and ToursByLocals use price ranges and "from $X".
- **Recommended fixes**:
 - Generate avatars server-side: `https://api.dicebear.com/9.x/initials/svg?seed=${name}` (free, no signup).
 - Add `verified: boolean` to buddy and render a small `<Icon icon={BadgeCheck} />` next to the name.
 - Show price as a range: `From $25/hr · From $80/day`.
- **Screenshot**: `15-buddy-detail.png`

### 4. Login `/login` & Register `/register`
- **Score: 6/10 for login; 7/10 for register**
- Login: Two-column layout — left side has `Welcome Back` headline + "Continue your journey…" tagline, right side has `Sign In` form with email/password/Remember me/Forgot password/Google/GitHub/Sign up now. Clean split. The Google/GitHub buttons are stacked below the primary — but Google is the *default expectation* in 2026, it should be at the top.
- Register: 3-step wizard (Personal Info → Role → Tags & bio). Uses **emoji-as-buttons** for the role picker (`🧳` Tourist, `🌍` Local buddy). Each role card has `role-card-icon` styled at 48–64px — the emoji dominates the card. With Lucide icons at 40px `Briefcase` vs `Globe`, this would look 10× more professional.
- **Issues**:
 1. Register's header is *different* from every other page — just an `L` letter logo + "Already a member? Sign in" link. No nav, no footer-mini. This is jarring because `/login` *does* show the full nav. Inconsistent mental model.
 2. Password placeholder says "At least 6 characters" — but the actual policy is ≥10 chars (per `utils/password-validator.ts`). The copy is stale.
 3. The "I agree to LOCALit's Terms of Service and Privacy Policy" checkbox has no actual link visible — the `Terms of Service` and `Privacy Policy` links are styled separately and visually lost.
- **Recommended fixes**:
 - Use the same `Header` component on `/login` and `/register` (with `userRole={undefined}`).
 - Update placeholder to "At least 10 characters, with a letter and a non-letter".
 - Move Google above the divider: `[Continue with Google]` button styled as primary, then `─── or ───`, then email/password.
- **Screenshots**: `08-login.png`, `14-register.png`

### 5. Tourist dashboard `/tourist/dashboard` (authed as john.doe)
- **Score: 6/10**
- Layout: hero strip "Welcome back, John !" + 4 stat tiles (Trips / Buddies connected / Pending requests / Reviews sent) + 2-column body (Your trips card + My buddies card) + Quick actions (4 cards) + map.
- **Visual hierarchy**: The hero greeting (`Welcome back, John !` with a space before the exclamation — minor bug) is large, the stats are colour-coded with emoji (🧳, ⏳, ⭐, ✓). The Quick Actions card grid uses emoji icons at ~28px (`.dashboard-action-icon`).
- **Typography**: 16–24px body, 30px H1, 24px H2. Good rhythm.
- **Issues**:
 1. Stat tiles use hard-coded color values `#FF6B35` etc. instead of CSS variables (`var(--primary)`). See `app/tourist/dashboard/page.tsx:110–113`.
 2. The map takes ~50% of the page width on desktop — fine. But on mobile it stacks below the trip cards, which means the user scrolls past their data to see who's nearby.
 3. "Reviews sent: 1" stat — but I see `⭐` icon for a number that represents *sent* reviews. Semantically wrong. Should be 📨 or 💬.
 4. The map is centered on the user but there are 6 buddy markers all overlapping around Da Nang centre. No clustering, no "X km away" filter actually applied.
- **Recommended fixes**:
 - Replace hard-coded colors with `var(--primary)` etc.
 - Move the map above the trip cards on mobile (`order: -1`).
 - Use `<Icon icon={Send} />` for "Reviews sent".
 - Add Leaflet `markercluster` plugin so 6 → 1 cluster on zoom-out.
- **Screenshot**: `03-tourist-dashboard.png`

### 6. Tourist browse `/tourist/browse` (authed)
- **Score: 6.5/10**
- Best page on the site, honestly. Search box, language dropdown, 4 filter chips (All / Top Rated / Near Me / Available Now), 6 buddy cards in a grid, map on the right. The cards have a coloured gradient hero, avatar circle, name, location, star rating, 3 specialty tags, 2 language chips, hourly rate.
- **Issues**:
 1. The buddy card hero is a `linear-gradient(135deg, var(--primary), var(--primary-light))` — 6 buddies × identical gradient = visual monotony. Generate a per-buddy gradient from a hash of `buddy.id`.
 2. Map markers (single-letter avatars `B`, `T`) overlap at default zoom — needs clustering (same as dashboard).
 3. "📍 Share my location" button is on the filter row but reads as a CTA — should be in the map's overlay toolbar instead.
 4. No pagination or "Load more" — fine for 6 buddies, will be a problem at 60+.
- **Recommended fixes**:
 - Per-buddy gradient (use `linear-gradient(135deg, hsl(${hash(id)%360}, 60%, 55%), hsl(${hash(id+1)%360}, 70%, 65%))`).
 - Add `react-leaflet-cluster` or `markercluster` for the map.
 - Move location share to inside the map card with the zoom controls.
- **Screenshot**: `02-tourist-browse.png`

### 7. Tourist trip create `/tourist/trips/create`
- **Score: 5.5/10**
- Form: Trip name, Destination (locked to Da Nang), Start date, End date, Notes (textarea), Stops section (place name, address, notes, "➕ Add stop"), "✓ Create trip" button.
- **Issues**:
 1. The Destination field is `readonly` with the explanation "LOCALit currently focuses on Da Nang." — fine, but should say `Da Nang` as the *placeholder* with a tooltip explaining the constraint, instead of locking the input.
 2. Dates use plain `type="date"` inputs — fine but no min-date validation (can pick yesterday).
 3. "Stops" section has no map to place pins, no ordering UI (it orders by stop_order but the user can't see that).
 4. The "Create trip" button uses ✓ checkmark as its primary icon — but a green primary CTA needs no icon. Drop the icon.
- **Recommended fixes**:
 - Make Destination a disabled select with `aria-describedby="destination-help"`.
 - Add `min={new Date().toISOString().slice(0,10)}` to date inputs.
 - Add drag-handles for stop reordering.
- **Screenshot**: `06-trip-create.png`

### 8. Tourist trip detail `/tourist/trips/2391e2e9-...`
- **Score: 7/10**
- Best trip screen on the site. Shows status badge, title, "📍 Da Nang • 📅 10/1/2026 - 10/3/2026", buddy card on the right (avatar + name), Notes section, "🗺️ Itinerary (3 stops)" with a numbered list of stops each with place, address, notes.
- **Issues**:
 1. The buddy card on the right has only `L Lan Pham` — no link to the buddy profile. Wait — there *is* a `<Link>` wrapping it, but it has no visible "→" affordance. Make it clearer.
 2. The numbered stops are bare cards — no map view, no "show on map" button per stop.
 3. The trip status badge (`✓ Confirmed`) is tiny green — should be a larger pill, more visible.
- **Screenshot**: `16-trip-detail.png`

### 9. Tourist profile `/tourist/profile`
- **Score: 6/10**
- Tabbed: Personal Info / Travel Preferences / My Trips / Saved Buddies / Reviews / Interests / Account. Seven tabs is too many for a single screen — they're squashed into a row with no scroll affordance on mobile.
- **Issues**:
 1. Tab labels use raw `<button>` elements without `role="tab"` / `aria-selected` — accessibility regression.
 2. "About me" textarea has `0/500 characters` counter but no visual indication of *what counts*. Some users think emoji count as multiple chars.
 3. **Travel style** uses 4 emoji buttons (🎒 Solo, 💑 Couple, 👥 Friends, 👨‍👩‍👧 Family). A 32-year-old male tourist picking 💑 Couple because the emoji is cute is a real risk. Replace with text labels (already there) and *drop* the emoji, or use neutral icons (`User`, `Users`, `Heart`, `Home`).
 4. Empty states use big emoji (`✈️ 48px`, `🔍 48px`) — they look like clip-art.
- **Screenshot**: `07-tourist-profile.png`

### 10. Tourist chat `/chat`
- **Score: 6/10**
- Two-column: left has conversation list (only "J John Doe" visible), right has the active chat with header (name + ⚪ Offline status), message list, textarea, "Send message" button.
- **Issues**:
 1. "Send message" button is a text label, no `→` or paper-plane icon. The button is `disabled` until text is typed but the disabled state isn't visually distinct (the colour doesn't change).
 2. The ⚪ Offline status indicator is text-only. A small circle icon (`<Circle fill="currentColor" />`) would make it scannable.
 3. Message bubbles have no timestamp visible. For a chat app this is a bug, not a missing feature.
 4. The conversation list doesn't show last-message preview, unread badge, or sort by recency. Withlocals shows "Hey, are you free Saturday? · 2h" with an unread dot.
- **Screenshot**: `13-chat.png`

### 11. Buddy dashboard `/buddy/dashboard` (authed as lan.pham)
- **Score: 6.5/10**
- Hero: `Hi Lan ! 👋`, "You're all caught up.", `🟢 Accepting requests` toggle. 4 stat tiles (Pending requests / Active connections / Upcoming trips / Avg rating). 3 cards: Connection requests (empty state), Quick actions, Upcoming trips.
- **Issues**:
 1. "Hi Lan !" has the same trailing-space-before-exclamation bug.
 2. The online/offline status toggle is a plain button — should be a proper switch (`<input type="checkbox" role="switch">`) with green/grey states.
 3. Stat tiles use emoji (⏳, ✓, 🧳, ⭐) at ~32px — large enough to dominate the small numerical value above them.
 4. "Avg rating" shows `5.0★` as a single tile — but a star tile alone is misleading; should pair with `(1 review)` to communicate sample size.
 5. The map takes a third of the page and is the same map widget as the tourist dashboard — could share but needs different defaults (show tourist pins, not all buddy pins).
- **Screenshot**: `09-buddy-dashboard.png`

### 12. Buddy requests `/buddy/requests`
- **Score: 6/10**
- Header: `Connection Requests`, `1 requests in total`, filter chips (All / ⏳ Pending / ✓ Accepted / ✕ Declined). One card shown: tourist name + flag + city + message preview.
- **Issues**:
 1. Filter chips use emoji (⏳ / ✓ / ✕) — same emoji-as-icon problem. Should be `Hourglass` / `Check` / `X` with colour tokens.
 2. The request card has no Accept / Decline CTA visible in the snapshot. Either the buttons are below the fold or the empty `Accept`/`Decline` actions are missing.
 3. The message is in a quoted block with curly quotes (`"…"`). On a marketplace, the request text should be more prominent — bigger, with the requester's avatar.
- **Screenshot**: `10-buddy-requests.png`

### 13. Buddy profile `/buddy/profile`
- **Score: 5/10**
- Tabbed like the tourist profile. Tabs: Profile / Location / Photos / Calendar / Settings. Each tab has a small emoji in the heading.
- **Issues**:
 1. Tabs are 5 — better than 7 but still tight. "Calendar" is an aspirational feature that doesn't exist yet (no booking flow).
 2. The page is mostly forms with no preview of what the tourist sees. Add a "Preview public profile" link at the top.
 3. Hourly rate field is a plain `type="number" input` — no currency selector (VND/USD), no suggested range ("Da Nang buddies charge $15–50/hr").
- **Screenshot**: `11-buddy-profile.png`

### 14. Buddy map `/map`
- **Score: 7/10**
- Full-screen Leaflet map with 4 buddy cards on the left, location-share button, "List view" toggle. Clean.
- **Issues**:
 1. The header is different on this page — no account menu, no dashboard link. The `Header.tsx` likely hides `NAV_LINKS` here but the user is still authed. Confusing.
 2. "List view" is a link, not a button — should be a toggle / segmented control.
 3. The map says `0 buddies shown on the map · Location sharing off` because Lan (signed in) hasn't shared her location — but the public version should show all Da Nang buddies regardless of the viewer's status.
- **Screenshot**: `12-buddy-map.png`

### 15. Mobile responsive (375px width check)
- **Score: 7/10**
- Mobile menu: hamburger icon opens a vertical nav with the same links as desktop, plus a Sign in / Sign up or 👤 My Profile / 🚪 Sign out block. Clean.
- **Issues**:
 1. The header's "Open menu" button is text-only with three `<span>` lines styled as the burger — on iOS the spans may render as actual text "span" before CSS overrides. Use `<svg>`.
 2. The 7-tab profile page overflows horizontally at 375px — there's no scroll-shadow affordance.
 3. Footer collapses to a single column on mobile but is *still* enormous — 3 columns stack, then the newsletter, then the bottom row. ~1500px of vertical real estate.

---

## Cross-page consistency issues

### Navbar inconsistencies
- Three different nav sets:
 - **guest**: Home, Buddies, Map
 - **tourist**: Dashboard, Buddies, Map, Trips, **Messages**
 - **buddy**: Dashboard, **Requests**, Map, Profile (no Trips, no Messages!)
- `/register` uses a *different* Header component (`L` logo + Sign in link), breaking the visual continuity.
- `/map` hides the auth menu entirely — feels like a different app.
- `/chat` shows only the logo + hamburger (no full nav), forcing the user to back-button to navigate.

### Typography inconsistencies
- Hero greeting has `Welcome back, John !` (space before `!`) on tourist dashboard AND `Hi Lan ! 👋` on buddy dashboard — same trailing-space bug in both.
- Body uses Poppins (system fallback) for most pages but Plus Jakarta Sans for some headings (`--font-family-alt`). Mixed.
- Some section headings use `<h4>` (font-bold mb-sm), others use `<h2 className="text-xl font-bold">`. Pick one.
- Placeholder text in some inputs is sentence case ("your@email.com") and lowercase in others ("you@example.com", "+84..."). Pick one.

### Color inconsistencies
- Hard-coded color hexes scattered through components:
 - `app/tourist/dashboard/page.tsx`: `#FF6B35`, `#FFC107`, `#FFB347`, `#28A745`
 - `app/buddy/dashboard/page.tsx`: same
 - `app/tourist/browse/page.tsx`: `var(--info)`, `#4dd0e1` for trip-card hero
- Some places use `var(--primary)` and some use `#FF6B35` directly. Audit & replace.
- Trip-card hero gradient `linear-gradient(135deg, var(--info), #4dd0e1)` mixes a CSS variable with a hard-coded colour — should be both variables or both hex.

### Icon inconsistencies
- **Footer uses real SVG social icons** (Twitter, Instagram, Facebook, LinkedIn inline). **Header uses emoji** (🌍, 👤, 🔍, 🚪). Inconsistent within the same chrome.
- Account menu items: `<span>👤</span> My Profile` and `<span>🚪</span> Sign out` — emoji inside a `<span>`. Mobile actions: same. Should be `<Icon icon={User} />` and `<Icon icon={LogOut} />` with proper size/colour tokens.
- Map markers use first-letter avatars (B, T) — same approach everywhere but no fallback for 2-word names or non-Latin names.
- Status badges mix emoji (`✓ Confirmed`, `⏳ Pending`, `✕ Declined`) with text-only badges (`badge-success` "Confirmed") in different parts of the app.

---

## Recommended refactor scope (priority order)

### 1. Critical (must-fix)
- **Icon library migration (emoji → Lucide).** Affects every page. ~80 replacements, mechanical, one PR.
- **Trust signals for marketplace.** Add verified badge, response-time, review-count next to star rating, "X travelers booked this buddy" counter. Without this the marketplace reads as "directory" not "transactional".
- **Real avatar fallback.** Either implement Supabase Storage uploads OR use DiceBear / Unsplash seed-based avatars. Buddy cards without photos look like 2014 Craigslist.

### 2. High
- **Unify navigation.** Single `Header` component, three role variants, but always present (including on `/register`, `/map`, `/chat`). The disappearing nav breaks the user's mental model.
- **Footer redesign.** Cut the footer's vertical footprint by 60%. Move the newsletter to its own page. Use a 2-row layout: row 1 = brand + 3 link columns, row 2 = legal + language switcher.
- **Real photographs on the homepage hero.** A tourism marketplace without a hero photo is the #1 conversion killer.
- **Map clustering.** Both `/map` and `/tourist/browse` use Leaflet with overlapping markers. Add `react-leaflet-cluster`.

### 3. Medium
- **Currency + locale.** "X/giờ" mixes Vietnamese and a `$` sign. Standardise on USD with locale-aware formatting (`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`).
- **Tab accessibility.** Add `role="tab"` + `aria-selected` + arrow-key navigation to all tabbed pages (profile, browse filters, requests filter).
- **Date input constraints.** Set `min` on trip-create dates so users can't pick the past.
- **Status badge consistency.** Use one component (`<StatusBadge kind="confirmed" />`) everywhere instead of inline emoji strings.
- **Hard-coded colors → tokens.** Sweep `app/tourist/dashboard/page.tsx`, `app/buddy/dashboard/page.tsx`, `app/tourist/trips/page.tsx` for hex literals.

### 4. Nice-to-have
- **Skeleton loaders.** Replace the centred `<div className="loading-spinner" />` with skeleton shapes that match the eventual content.
- **Empty-state illustrations.** Replace the `🧳` / `✈️` / `🔍` 48px emoji with simple line illustrations (unDraw, Storyset, or Blush).
- **Toast notifications.** The signup confirmation toast exists on `/` (`showSubscribedToast`) but other actions (save, request sent) have no toast.
- **Dark mode.** The tokens already support it via CSS vars. Add a `data-theme="dark"` toggle.

---

## Icon library integration plan

### Pick
**`lucide-react`** v0.4xx (latest stable in 2026).

### Install
```bash
npm install lucide-react
# (no peer deps, no PostCSS config needed, no font loader)
```

### Setup
Create `components/ui/Icon.tsx` (already drafted above). Optionally add CSS variables for icon colour if you want to control via theme:

```css
/* app/globals.css */
:root {
  --icon-default: var(--text-secondary);
  --icon-muted: var(--text-muted);
  --icon-primary: var(--primary);
  --icon-success: var(--success);
}
```

### Usage pattern

```tsx
// before
<button className="btn btn-primary">➕ Plan a trip</button>

// after
import { Plus } from 'lucide-react'
<button className="btn btn-primary">
  <Plus size={18} aria-hidden="true" />
  Plan a trip
</button>
```

### Accessibility
- Always `aria-hidden="true"` on the icon when adjacent text already conveys the meaning.
- When icon is the *only* affordance (e.g. close button), use `<button aria-label="Close"><X size={18} aria-hidden="true" /></button>`.

### Migration list (file by file)
See the table above (~80 replacements, 18 files). Suggest doing it in 3 PRs:
1. **PR 1:** Add `lucide-react`, create `Icon.tsx`, migrate `Header.tsx` + `Footer.tsx` (the chrome — highest visibility).
2. **PR 2:** Migrate `app/page.tsx`, `app/tourist/dashboard/page.tsx`, `app/buddy/dashboard/page.tsx` (the dashboards — second-highest visibility).
3. **PR 3:** Migrate the remaining 14 files.

### Final visual test
Run `npm run build && npm run start`, open each page in the browser, eyeball. Then run the existing `scripts/redteam-final.mjs` to ensure no behavioural regressions.

---

## Appendix: file-level evidence index

| Screenshot | Path | Notes |
|---|---|---|
| Homepage anon | `docs/audit-screenshots/01-homepage-anon.png` | Hero, search, featured destinations, footer |
| Tourist browse | `docs/audit-screenshots/02-tourist-browse.png` | Filters, cards, map (anon → login) |
| Tourist dashboard | `docs/audit-screenshots/03-tourist-dashboard.png` | Hero, 4 stat tiles, trips, buddies, quick actions |
| Tourist trips | `docs/audit-screenshots/05-trips.png` | Trip cards with gradient hero |
| Trip create | `docs/audit-screenshots/06-trip-create.png` | Form, stops builder |
| Tourist profile | `docs/audit-screenshots/07-tourist-profile.png` | 7 tabs |
| Login | `docs/audit-screenshots/08-login.png` | Split layout, social buttons |
| Buddy dashboard | `docs/audit-screenshots/09-buddy-dashboard.png` | Hero, stats, quick actions, map |
| Buddy requests | `docs/audit-screenshots/10-buddy-requests.png` | Filter chips, request card |
| Buddy profile | `docs/audit-screenshots/11-buddy-profile.png` | 5 tabs, form-heavy |
| Buddy map | `docs/audit-screenshots/12-buddy-map.png` | Full-screen Leaflet |
| Chat | `docs/audit-screenshots/13-chat.png` | Conversation list + message thread |
| Register | `docs/audit-screenshots/14-register.png` | Step 0 form (Personal Info) |
| Buddy detail | `docs/audit-screenshots/15-buddy-detail.png` | Profile, message CTA, map |
| Trip detail | `docs/audit-screenshots/16-trip-detail.png` | Itinerary, buddy card, stops |

---

## Closing note

LOCALit has a real design system — tokens, spacing scale, typography, base components. What's missing is *fidelity*: the difference between a Bootstrap-style MVP and a marketplace a traveler would trust with their trip. Three changes would close 80% of the gap:

1. **Lucide icons everywhere** (replaces ~26 emoji, mechanical, one PR).
2. **Real photographs** in the hero, on buddy cards, in trip itineraries.
3. **Trust signals** on every buddy profile (verified badge, response time, review count, traveler count).

Everything else in this audit is polish. Get those three right and the rest can land over the next few sprints.
