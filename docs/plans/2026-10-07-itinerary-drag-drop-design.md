# Itinerary Drag-Drop (Trello-style) — Design Document

**Date:** 2026-10-07
**Branch:** `feat/itinerary-rebuild`
**Status:** Implementation in progress
**Author:** Cursor session (brainstorm → design → implementation)

---

## 1. Triết lý

LOCALit's itinerary phải feel như **Trello board** — bạn kéo 1 stop từ Morning → Afternoon, người edit cùng trip thấy thay đổi ngay. Không dialog, không confirm. **Optimistic UX** với **Last-Write-Wins** consistency cho multi-user.

### Anti-reference
- Không phải: Asana board với subtask expand, Monday.com với status pipeline.

### Anchor
Da Nang travel brochure: gọn, dense thông tin, không animations thừa.

---

## 2. Phạm vi (MVP)

- Drag stops giữa 3 buckets (Morning / Afternoon / Evening) trong **cùng 1 day**.
- Realtime sync giữa nhiều collaborators (2 người cùng edit).
- Reorder stops trong cùng 1 bucket.

### Out of scope
- Drag giữa các days (sẽ cần reorder day position).
- Drag stops chưa có planned_time (sẽ fix ở bucket "Unscheduled").
- Drag packing items (separate component).

---

## 3. Component tree

```
<ItineraryDayBoard tripId dayId stops canEdit me onRealtimeConflict>
  <DndContext sensors={[Pointer, Keyboard]} collisionDetection={closestCorners}>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BucketColumn bucket="morning">
        <SortableContext items={idsMorning} strategy={verticalListSortingStrategy}>
          {morningStops.map(s => <SortableStopCard key={s.id} stop={s} canEdit />)}
        </SortableContext>
      </BucketColumn>
      <!-- afternoon, evening -->
    </div>
    <DragOverlay>{activeStop && <StopCardPreview stop={activeStop} />}</DragOverlay>
  </DndContext>
</ItineraryDayBoard>
```

---

## 4. Data model

### Schema change

```sql
-- 2026-10-07-trip-stops-bucket-override.sql
ALTER TABLE trip_stops
  ADD COLUMN IF NOT EXISTS day_bucket_override TEXT
    CHECK (day_bucket_override IN ('morning', 'afternoon', 'evening', 'unscheduled'));

-- Index for bucket-ordered reads (one board load = one query)
CREATE INDEX IF NOT EXISTS idx_trip_stops_day_bucket_pos
  ON trip_stops (day_id, COALESCE(day_bucket_override, 'auto'), position);

-- The 'auto' bucket means "derive from planned_time". We use
-- COALESCE(...) at query time so the index serves both columns.
```

### Bucket resolution

```ts
function effectiveBucket(stop: ItineraryStop): ItineraryBucket {
  if (stop.day_bucket_override) return stop.day_bucket_override
  return deriveBucketFromTime(stop.planned_time)
}

function deriveBucketFromTime(time: string | null): ItineraryBucket {
  if (!time) return 'unscheduled'
  const hour = parseInt(time.slice(0, 2), 10)
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
```

User override is stored separately from `planned_time` so editing the time later doesn't surprise the user.

---

## 5. Drag-drop interactions

| User action | Local state | Server write | Realtime broadcast |
|---|---|---|---|
| Drag card across buckets | `stops` re-shuffled in 3 column arrays | `UPDATE day_bucket_override` on that stop | `postgres_changes` UPDATE fires |
| Drop in same column at different index | `arrayMove` within SortableContext | `UPDATE position` on all affected siblings (batch) | `postgres_changes` UPDATE fires |
| Drop on a column header | Treat as drop at end of that column | Same as above | Same |
| Press Esc during drag | Cancel | No-op | No-op |

### Optimistic + revert pattern

```ts
async function moveStop(stopId: string, toBucket: ItineraryBucket, newIndex: number) {
  const prevState = stops  // for revert
  setStops(reorderLocally(stops, stopId, toBucket, newIndex))
  try {
    await Promise.all([
      sb.from('trip_stops').update({
        day_bucket_override: toBucket,
        position: newIndex,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      }).eq('id', stopId),
      ...siblings.map((s, i) =>
        sb.from('trip_stops').update({ position: i }).eq('id', s.id)
      ),
    ])
  } catch (e) {
    setStops(prevState)  // revert
    toast.error('Could not save your move — try again')
  }
}
```

### Conflict resolution

Realtime `postgres_changes` UPDATE arrives → compare `updated_at`:
- If `updated_at > lastSeenByMe[stopId]` AND `updated_by !== me.id` → real conflict, toast "Lan just moved this"
- If `updated_by === me.id` → my own write arrived, dedup
- Otherwise → merge into local state

---

## 6. UI / visual contract

### Board layout

- **Desktop**: 3 columns grid `grid-cols-3 gap-4`, each column `min-w-0` (shrink-safe on overflow).
- **Mobile**: stack với `grid-cols-1`, drop into next column = auto-scroll.

### Column

```tsx
<header className="flex items-center justify-between px-3 py-2 border-b border-border">
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink uppercase tracking-wide">
    <Sun size={12} aria-hidden /> Morning
  </span>
  <span className="badge badge-neutral">{count}</span>
</header>
<div className="flex-1 p-2 min-h-[120px]" data-bucket="morning">
  {stops.map(s => <SortableStopCard key={s.id} stop={s} />)}
  {/* empty drop placeholder */}
</div>
```

### Card (SortableStopCard)

```tsx
<article className={`
  group bg-surface border border-border rounded-sm p-3 cursor-grab
  active:cursor-grabbing
  ${isDragging ? 'opacity-30' : ''}
  ${isOverlay ? 'rotate-2 ring-2 ring-primary' : ''}
`}>
  <span className="flex items-start gap-2">
    <GripVertical size={14} className="text-subtle opacity-0 group-hover:opacity-100" />
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium text-ink truncate">{stop.name}</span>
      <span className="block text-xs text-muted">{stop.planned_time ?? '—'}</span>
    </span>
  </span>
</article>
```

### Drop zones

Empty columns render a dashed placeholder. During drag, the column under the cursor gets a `bg-paper` + `border-dashed` overlay.

### Drag handle

`GripVertical` icon, only visible on `group-hover`. Whole card is draggable via PointerSensor activation constraint `distance: 4` (avoids accidental drags when clicking).

---

## 7. Realtime subscription

```ts
// hooks/useStopsRealtime.ts
function useStopsRealtime(dayId: string, onUpdate: (stop: TripStop) => void) {
  useEffect(() => {
    const sb = createClient()
    const channel = sb
      .channel(`stops:${dayId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'trip_stops', filter: `day_id=eq.${dayId}` },
        payload => onUpdate(payload.new as TripStop),
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [dayId, onUpdate])
}
```

Filters on `day_id` so we only get updates for the current day. The hook lives in `ItineraryDayBoard` so each board has its own channel.

---

## 8. Accessibility

- `PointerSensor` + `KeyboardSensor` for keyboard-only navigation (Tab/Arrows/Space).
- `aria-label` on each card: "Marble Mountains, 09:30, Morning bucket, drag to reorder".
- `aria-live="polite"` on column count badges.
- All buttons (edit/delete on card) remain keyboard-activatable; drag is additional, not required.

---

## 9. Files

**New:**
- `supabase/migrations/2026-10-07-trip-stops-bucket-override.sql` — schema
- `components/itinerary/ItineraryDayBoard.tsx` — orchestrator (~180 lines)
- `components/itinerary/SortableStopCard.tsx` — draggable card (~80 lines)
- `components/itinerary/BucketColumn.tsx` — column wrapper (~60 lines)
- `lib/itinerary/buckets.ts` — pure helpers (`effectiveBucket`, `deriveBucketFromTime`, `BUCKET_META`)
- `hooks/useStopsRealtime.ts` — realtime + LWW merge (~70 lines)

**Modified:**
- `app/itinerary/[id]/page.tsx` — extract day section → `<ItineraryDayBoard>`
- `lib/types.ts` — add `ItineraryBucket` type + `day_bucket_override?` field
- `package.json` — add `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (~60kb total)

---

## 10. Implementation phases

| Phase | Effort | Rollback |
|---|---|---|
| 1. Schema migration + types | 30 min | `DROP COLUMN` |
| 2. Bucket helpers + SortableStopCard | 1h | git revert |
| 3. ItineraryDayBoard + DnD logic | 2h | git revert |
| 4. Realtime subscription + LWW | 1.5h | gate by flag |
| 5. Integration into page.tsx | 1h | git revert |
| 6. Smoke + E2E | 1h | — |

Total: ~7h.

---

## 11. Verification

1. `npm run build` — TS pass
2. `node scripts/smoke-bucket.mjs` — schema + helpers
3. Browser test:
   - Open `/itinerary/<id>` as Lan, drag a stop from Morning → Afternoon
   - Open same `/itinerary/<id>` as John in 2nd context
   - Both should see the same final position (after <500ms realtime)
4. `node scripts/redteam-final.mjs` — 12 old security issues still closed

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Race condition 2-user drag same stop | LWW + conflict toast |
| SSR mismatch with dnd-kit | Component dynamic import `'use client'` |
| Touch device drag | PointerSensor covers touch + mouse |
| Realtime quota (Supabase free tier) | Filter per day_id; max 1 channel / active day |
| Index performance | `idx_trip_stops_day_bucket_pos` covers main query |