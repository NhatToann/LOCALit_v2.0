# Connection Bugs — Design + Fix Plan (2026-10-15)

## Bugs Reported

1. **2 nút Message** trên buddy/tourist public view
2. Không có notification khi **gửi connection request**
3. Không có notification khi **accept** request
4. Không có **số ngày** trên pending request card

---

## Root Cause Analysis

### Bug 1 — 2 nút Message

| File | Line | Duplication |
|---|---|---|
| `components/buddy/BuddyPublicView.tsx` | 227-235 | Hard-coded `<Link href="/chat?buddy=...">Message</Link>` ngoài `ConnectActionButton` |
| `components/tourist/TouristPublicView.tsx` | 178-186 | Tương tự |

`ConnectButton` đã render nút Message khi `state.status === 'accepted'`. Hai file này thêm một nút Message link cứng → 2 nút cùng hiển thị.

### Bug 2 — Không có notification khi gửi request

`POST /api/connections` insert row vào `connections` xong → trả response 201. Không có INSERT vào `notifications`.

### Bug 3 — Không có notification khi accept/reject

`PATCH /api/connections/[id]` với `action='accept'` / `'reject'` update status → trả response. Không có INSERT vào `notifications`.

### Bug 3b — Không có notification khi cancel (extension)

Cùng vấn đề với `action='cancel'`: bên kia không biết là request đã bị huỷ.

### Bug 4 — Không có số ngày trên pending

`ConnectionCard` chỉ hiển thị "Request pending" / "New request" — không kèm `duration_days` từ row. `ConnectionStatusBadge` cũng vậy.

---

## Fix Plan

### Step 1 — Xoá duplicate Message link

| File | Action |
|---|---|
| `components/buddy/BuddyPublicView.tsx` | Xoá `<Link href="/chat?buddy=...">Message</Link>` (line 227-235). Xoá luôn import `MessageCircle` không dùng. |
| `components/tourist/TouristPublicView.tsx` | Xoá tương tự (line 178-186). |

### Step 2 — Notification khi POST connection

In `app/api/connections/route.ts`, sau khi insert connection thành công:

```ts
void (async () => {
  try {
    await supabase.from('notifications').insert({
      user_id: recipient_id,
      type: 'connection_request',
      title: 'New connection request',
      body: `${caller.full_name} wants to connect with you`,
      actor_id: user.id,
      link: '/connections',
    })
  } catch { /* fire-and-forget */ }
})()
```

Cần thêm `full_name` vào `select` của `caller`.

### Step 3 — Notification khi PATCH connection

In `app/api/connections/[id]/route.ts`, sau mỗi thành công:

```ts
const otherId = existing.requester_id === user.id
  ? existing.recipient_id
  : existing.requester_id
```

- `accept` → insert type `connection_accepted` cho `otherId`
- `reject` → insert type `connection_declined` cho `otherId`
- `cancel` → insert type `connection_declined` cho `otherId`

Body lấy `caller.full_name` qua `supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()`.

### Step 4 — Hiển thị `duration_days` trên pending

In `ConnectionCard.tsx` (line ~111):

```ts
if (row.status === 'pending') {
  const daysHint = row.duration_days
    ? ` · ${row.duration_days}-day plan`
    : ''
  return iAmRequester
    ? `Request pending${daysHint}`
    : `New request${daysHint}`
}
```

In `ConnectionStatusBadge.tsx` (line ~40): cùng pattern, dùng `state.durationDays`.

---

## Implementation

| File | Status | Build |
|---|---|---|
| `app/api/connections/route.ts` | ✅ Edited (POST → insert notification) | OK |
| `app/api/connections/[id]/route.ts` | ✅ Edited (PATCH accept/reject/cancel → insert notification) | OK |
| `components/buddy/BuddyPublicView.tsx` | ✅ Edited (xoá hard-coded Message) | OK |
| `components/tourist/TouristPublicView.tsx` | ✅ Edited (xoá hard-coded Message) | OK |
| `components/connection/ConnectionCard.tsx` | ✅ Edited (label có days) | OK |
| `components/connection/ConnectionStatusBadge.tsx` | ✅ Edited (label có days) | OK |

Deploy: `localit-jz30a6cl7-nhattoann.vercel.app` (alias `localit-nhattoann.vercel.app` + `localit-vn.vercel.app`).

## Verification Checklist

- [ ] Mở 2 tab → A gửi request → B thấy bell badge +1
- [ ] B Accept → A thấy bell badge +1
- [ ] A vào `/connections` → thấy "Active · 7 days left"
- [ ] Vào `/buddies/[id]` chỉ thấy đúng 1 nút Message
- [ ] Pending card hiển thị "Request pending · 7-day plan" hoặc "New request · 7-day plan"
- [ ] A Cancel → B thấy notification "Connection cancelled"
