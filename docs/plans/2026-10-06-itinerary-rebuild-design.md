# Itinerary Rebuild — Design Document

**Date:** 2026-10-06
**Branch:** `feat/itinerary-rebuild`
**Status:** Phase 0 in progress
**Author:** Cursor session (brainstorm → design → implementation)

---

## 1. Triết lý sản phẩm

### 1.1 Anchor

LOCALit bán **buddies có thật ở Đà Nẵng** (Lan, Hải, My…), không bán AI. "Itinerary thông minh" trong bối cảnh này = **operational intelligence** thuần computation:

- Biết Marble Mountains đóng cửa 17:30 (từ OSM `opening_hours`)
- Biết Hải Châu ↔ Sơn Trà cách nhau 12 km, 22 phút lái xe (haversine + travel-time table)
- Biết ngày có 7 stops là "quá tải" (threshold 5)
- Biết packing list phải có "sunscreen SPF 50" khi có beach stop (rule-based)

**KHÔNG có LLM call.** Mọi "thông minh" là pure functions + cached OSM data.

### 1.2 Anti-reference

Không phải: Notion AI calendar, Google Travel, Roadtrippers, TripIt, Mindtrip.

**Có thể là:** Tờ travel brochure in của Sở Du lịch Đà Nẵng gấp 3 — gọn, dày thông tin, có bản đồ, giờ mở cửa thật, số điện thoại thật, giá thật.

### 1.3 4 nguyên tắc cốt lõi

1. **Map = first-class citizen.** Itinerary nằm trên 1 canvas bản đồ. Stops là pins, days là route polylines, click pin mở detail. KHÔNG có modal fullscreen.
2. **Places có thật có metadata có thật.** OSM (Nominatim) cho query tự do, Overpass (deferred) cho category browse. Client cache 7 ngày.
3. **Operational intelligence = computation, không phải LLM.** Distance, time, warnings = pure functions. Không gọi OpenAI/Claude.
4. **Đồng bộ real-time.** Tourist + buddy cùng edit, thấy cursor/drag của nhau qua Supabase Realtime.

### 1.4 Component tree mới

```
app/itinerary/[connectionId]/page.tsx          # orchestrator (~200 dòng, giảm từ 607)
├── ItineraryHeader.tsx                        # breadcrumb + share + group pills
├── ItineraryHero.tsx                          # title + status + trip meta
├── ItineraryMap.tsx                           # ← map-first, 60vh
│   ├── PlacePickerSheet.tsx                   # bottom sheet OSM search
│   ├── StopDetailCard.tsx                     # popover khi click pin
│   └── DayRouteOverlay.tsx                    # polyline màu theo day
├── DayTimeline.tsx                            # horizontal scroll các day
│   ├── DayColumn.tsx                          # 1 day, morning/afternoon/evening
│   ├── StopCard.tsx                           # drag-drop, inline edit
│   └── DaySummary.tsx                         # distance/time/warning
├── OperationalInsights.tsx                    # 4-5 chip metric
├── BudgetTracker.tsx                          # dùng trips.budget_estimate (added Phase 0)
├── PackingSmartList.tsx                       # per-traveler mode
├── NotesTab.tsx                               # 5 trường structured
├── ManageCompanions.tsx                       # giữ nguyên
└── ActivityFeed.tsx                           # giữ nguyên
```

---

## 2. OSM data model & Map-first canvas

### 2.1 OSM (không seed DB)

- **Search:** `https://nominatim.openstreetmap.org/search?format=json&limit=8&q={query},Da Nang,Vietnam&addressdetails=1&extratags=1`
- **Reverse:** đã có sẵn trong `MapFullscreen.tsx`
- **Client cache:** `localStorage[localit:osm:cache:v1]`, TTL 7 ngày, key = SHA-1(query)
- **Overpass (deferred):** category browse (`tourism=attraction` etc.) trong bbox Đà Nẵng

### 2.2 Places registry trong trip

Mỗi stop lưu trong `trip_stops` với:

| Column | Type | Nguồn |
|---|---|---|
| `osm_id` | BIGINT | từ OSM result (optional) |
| `osm_type` | TEXT | `node` / `way` / `relation` |
| `opening_hours` | TEXT | snapshot OSM `extratags` |
| `phone` | TEXT | snapshot OSM |
| `website` | TEXT | snapshot OSM |
| `name`, `address`, `latitude`, `longitude` | (đã có) | user-edited sau khi pick |
| `category` | TEXT | user chọn, KHÔNG tin OSM |
| `updated_by`, `updated_at` | UUID, TIMESTAMPTZ | LWW metadata |

### 2.3 Map-first canvas

Layout dọc 1 trang (không tabs):

1. Header (breadcrumb, share)
2. Hero (title, status, members)
3. Map 60vh (full-width desktop, sticky `h-72` mobile)
4. Day timeline (horizontal scroll desktop, wrap mobile)
5. Operational insights (4-5 chip)
6. Packing (collapsed card → drawer)
7. Notes (5 trường structured)
8. Manage group (collapsed)
9. Activity (collapsed)

### 2.4 Multi-user realtime (LWW + presence)

**Channels:**

| Channel | Type | Mục đích |
|---|---|---|
| `trip:${tripId}:presence` | Presence | track ai đang xem, hiển thị avatar dot |
| `trip:${tripId}:pin-drag` | Broadcast | kéo pin, user khác thấy follow |
| `trip:${tripId}:typing` | Broadcast | field-level soft-lock, hiển thị "Hana is editing…" |

**Conflict resolution: Optimistic LWW**
- Mỗi write = `updated_at = now()` + `updated_by = userId`
- Inline "Last edited by Lan · 2 min ago" bên cạnh field
- Soft-lock (không block): "Hana is editing this · wait or override?"
- Server không cần bảng mới

**Giới hạn MVP:**
- Max 10 collaborators / trip (UI display, không enforce DB)
- Không version history (chỉ last-edited timestamp)
- Không undo/redo

---

## 3. Component specs

### 3.1 `ItineraryMap.tsx`

Props: `{ tripId, stops, days, canEdit, me, onStopChange, onStopAdd, onStopRemove }`

- `<MapContainer>` full-bleed, 60vh desktop, 18rem mobile sticky
- 1 marker / stop, icon số thứ tự, màu theo bucket
- 1 polyline / day, màu theo `idx % 4` palette
- Floating `[+ Add place]` control góc phải
- Auto-fit bounds khi stops thay đổi
- Click marker → `StopDetailCard` popover
- Click empty map (canEdit) → `PlacePickerSheet` bottom sheet
- Drag marker (canEdit) → optimistic update + broadcast throttled 50ms
- Long-press marker (mobile 500ms) → context menu

### 3.2 `PlacePickerSheet.tsx`

Props: `{ open, onClose, onPick(loc), initialQuery? }`

- Bottom sheet mobile / right sidebar desktop (50% viewport)
- Search input debounce 300ms
- 8 results, mỗi result: name + category icon + distance + address
- "Can't find it? Add custom place" → form name + lat/lng
- Anti-slop: flat border 4px, không glassmorphism, không gradient

### 3.3 `DayTimeline.tsx`

Props: `{ trip, days, stops, canEdit, me, onStopUpdate, onStopMove, ... }`

- Horizontal scroll desktop / 2-row wrap mobile
- 1 `<DayColumn>` / day, width `w-72` desktop
- Header: `Day N · {date or "No date"}` + inline edit pencil
- Body: 3 buckets (morning/afternoon/evening), auto-derive từ `planned_time`
- Footer: `{stops.length} stops · {distance}km · {driveMinutes}m` + warning chip > 5 stops hoặc > 30km

### 3.4 `OperationalInsights.tsx`

5 chip computation thuần JS:

| Chip | Computation |
|---|---|
| Total distance | sum(haversine(stop[i], stop[i+1])) per day |
| Drive time | distance × 1.4 (hệ số Đà Nẵng) |
| Stops outside hours | count OSM `opening_hours` regex parse |
| Overloaded days | count days with stops > 5 |
| Budget total | sum user-input cost |

### 3.5 `PackingSmartList.tsx` (refactor `PackingTab.tsx`)

- 2 chế độ: "All items" (5 cột category) / "Per-traveler" (1 cột / traveler)
- Mỗi item có badge "Shared" / "Personal"
- Smart suggestions giữ nguyên `suggestItems(stops, items)` từ `lib/packing-suggestions.ts`

### 3.6 `NotesTab.tsx` (refactor)

5 trường structured:

| Field | Type | Save |
|---|---|---|
| `weather` | text (auto-fill OWM) | blur |
| `transport` | select | change |
| `cost_estimate` | number + currency | blur |
| `meetup_point` | text + lat/lng | blur |
| `notes` | markdown textarea | autosave 1.2s |

OWM qua server proxy `/api/weather`, key ở `OWM_API_KEY` env.

### 3.7 `ManageCompanions.tsx`, `ActivityFeed.tsx`

Giữ nguyên, chỉ đổi vị trí xuống footer page, vẫn collapsed mặc định.

---

## 4. Schema changes

```sql
-- 2026-10-06-itinerary-rebuild.sql
BEGIN;

ALTER TABLE trip_stops
  ADD COLUMN IF NOT EXISTS osm_id BIGINT,
  ADD COLUMN IF NOT EXISTS osm_type TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE trip_days
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE trip_packing_items
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS weather_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS budget_estimate NUMERIC;

-- Defensive: re-grant service_role (AGENTS.md pitfall)
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_stops TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_days TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_packing_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON trips TO service_role;

COMMIT;
```

**Rollback:** `DROP COLUMN IF EXISTS` cho mọi cột mới (giữ RLS nguyên).

**KHÔNG thay đổi RLS.** Schema hiện tại đã được audit 2026-09-26, không touch.

---

## 5. Implementation phases

| Phase | Nội dung | Effort | Rollback |
|---|---|---|---|
| 0 | Schema migration + service_role re-grant | 1.5h | `DROP COLUMN` |
| 1 | Page restructure (607 → 200 dòng) | 2h | `git revert` |
| 2 | Map-first canvas + PlacePickerSheet | 3h | `git revert` |
| 3 | Realtime collab (presence + broadcast) | 3h | tắt channel |
| 4 | Operational insights + OWM proxy | 2h | ẩn section |
| 5 | NotesTab + PackingSmartList refactor | 2h | `git revert` |
| **Total** | | **13.5h** | |

---

## 6. Verification plan

### Local sau mỗi phase
1. `npm run build` — TypeScript pass
2. `npm run lint` — không warning mới
3. Manual: 2 browser context (John + Lan) test acceptance

### Staging (preview deploy)
1. `vercel --yes` (không `--prod`)
2. `node scripts/playwright-trip-test.mjs` — assert realtime
3. `vercel curl <preview>/itinerary/<id>` → 200

### Production
1. `vercel --prod --yes` + `vercel alias set <hash> localit-nhattoann.vercel.app`
2. Smoke test qua browser thật, 2 profile thật
3. `node scripts/redteam-final.mjs` — 12 issues cũ vẫn closed

---

## 7. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Schema migration strip `service_role` grants | Critical: 12 admin endpoints fail | Re-grant + diag script verify |
| Supabase Realtime quota (2M events/mo free) | Medium | Throttle 50ms drag, max 5 channels / trip |
| OSM Nominatim rate limit (1 req/s) | Medium | Client cache 7 ngày, error UI thân thiện |
| OpenWeatherMap key lộ | Critical: bill shock | Server proxy, không `NEXT_PUBLIC_*` |
| Multi-user drag conflict | Low: visual jitter, không corrupt | LWW ở commit, broadcast chỉ hint |
| Map full-width mobile che content | Medium: UX | Sticky `h-72` không full-bleed |

---

## 8. Out of scope (MVP)

- LLM-generated itineraries
- Stripe payments cho trip
- Trip photos upload (Phase 3 theo `AGENTS.md`)
- Push notifications khi partner edit
- Version history & undo/redo
- Auto-translate chat
- Overpass API category browse
- Mapbox tiles (giữ OSM)

---

## 9. References

- `AGENTS.md` — security hardening, Postgres gotchas, Vercel alias
- `docs/design.md` — color tokens, typography, anti-slop rules
- `lib/packing-suggestions.ts` — rule-based packing engine (giữ nguyên)
- `lib/day-buckets.ts` — auto-bucket từ `planned_time` (giữ nguyên)
- `lib/transport.ts` — transport enum (giữ nguyên)
