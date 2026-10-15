# Connect Feature — Design & Implementation Plan

**Date:** 2026-10-15
**Status:** Draft
**Stakeholder:** LOCALit Kỳ 8

---

## 1. Concept

Connect is a symmetric, bilateral relationship between any two users of the platform (tourist↔buddy, buddy↔buddy, tourist↔tourist). It unlocks collaborative features (chat, shared itinerary editing) for that pair. It has a per-pair expiry with renewal and a per-pair lock when expired.

**Philosophy:** Chat and Trip are independent features. A connection does not create a trip, and a trip does not affect a connection. Voice call travels with chat. Review is unlocked at ACTIVE state (no trip required).

---

## 2. Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  A ──── "Connect" ──── B                                   │
│    PENDING ────────────────► ACTIVE ──────► ENDED           │
│       │                         │              │            │
│  [both can cancel]        [any can cancel]   (archived)    │
│                            [auto-expire]                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 States

| State | Meaning | Who can transition |
|---|---|---|
| `none` | No connection between A and B | — |
| `pending` | A sent a request to B | B: accept / reject; A or B: cancel |
| `active` | Both connected | A or B: cancel; auto: expiry → locked |
| `ended` | Archived history | — |

### 2.2 Transitions

| Action | Trigger | Result | Notifications |
|---|---|---|---|
| Send request | User clicks "Connect" → popup duration → confirm | → `pending` | In-app bell to recipient |
| Accept | Recipient clicks Accept | → `active` | In-app bell to sender |
| Reject | Recipient clicks Reject | → `ended` | In-app bell to sender |
| Cancel (pending) | Sender or recipient clicks Cancel | → `ended` | In-app bell to other party |
| Cancel (active) | Either party clicks Cancel | → `ended` | In-app bell to other party |
| Expire | Duration runs out without renewal | → `locked` | In-app bell to both |
| Renew | Either party clicks Renew | Reset countdown to full duration | In-app bell to other party |

### 2.3 Duplicate Request While Active

If A is already `active` with B and sends another request:
- Show in B's notifications as "A wants to connect again"
- B can Accept (stays active, no state change) or Reject
- A can Cancel the duplicate request

### 2.4 Pending Expiry

`pending` requests do **NOT** expire automatically. They persist until accept, reject, or cancel.

### 2.5 Reject → Can Resend Immediately

After a rejection, the sender can send a new request right away.

---

## 3. Unlock Matrix

| Feature | `none` / `pending` / `ended` | `active` | `locked` |
|---|---|---|---|
| Chat (send/receive) | ❌ Cannot send | ✅ Full access | 🔒 Read-only |
| Voice Call | ❌ | ✅ Full access | ❌ |
| Itinerary (own, solo) | ✅ Edit | ✅ Edit | ✅ Edit |
| Itinerary (collaborator) | ❌ Not invited | ✅ Edit | 🔒 Read-only |
| Review (write new) | ❌ | ✅ | ❌ |
| Review (read existing) | ✅ | ✅ | ✅ |

**Voice call** requires an active connection. No trip required.

---

## 4. Duration & Expiry

### 4.1 Duration

- Range: **1–30 days** (integer)
- Default: stored in `profiles.default_connection_duration` (days), set via user settings
- User selects duration in a popup **before sending the request**
- Duration picker presets: 1, 7, 14, 30 days (or any value 1–30)

### 4.2 Expiry Clock

- Starts at: moment of `accept` (not when request was sent)
- Display: "X days left" on profile + in notifications
- Warning: **1 day before** expiry → in-app notification to both parties

### 4.3 Renew

- Either party can renew → resets countdown to full duration (not extends from today)
- On renew: in-app notification to the other party
- Shortcut from lock notification → `/connections` page with the relevant pair highlighted

### 4.4 Lock

When duration expires without renewal:
- `active` → `locked` (same row, new column or status flag)
- Both parties are locked out of the features above
- Chat: read-only (can scroll, cannot send)
- Itinerary collaborator: read-only
- Review: cannot write new, can read existing
- To regain access: send a new request (back to `pending`)

---

## 5. Notifications

All events trigger an in-app bell notification. No email for now.

| Event | Recipient(s) |
|---|---|
| Request received | Recipient |
| Request accepted | Sender |
| Request rejected | Sender |
| Request cancelled (pending) | Other party |
| Active cancelled | Other party |
| Expiry warning (1 day left) | Both |
| Connection locked | Both |
| Connection renewed | Other party |
| "Wants to connect again" (duplicate) | Recipient |

Notification payload includes:
- `type`: `connect_request`, `connect_accepted`, `connect_rejected`, `connect_cancelled`, `connect_warning`, `connect_locked`, `connect_renewed`, `connect_again`
- `from_user_id`: who triggered the event
- `to_user_id`: who receives the notification
- `connection_id`: relevant connection row
- `link`: deep link to relevant page (`/connections`, `/chat`, `/itinerary/[id]`, etc.)

---

## 6. Database Schema

### 6.1 New / Modified Tables

#### `connections` (existing — needs review)

Check current schema. Expected columns:
- `id` uuid PK
- `user_a_id` uuid FK → profiles
- `user_b_id` uuid FK → profiles
- `status` enum: `pending`, `active`, `ended`
- `duration_days` int — duration chosen at request time
- `accepted_at` timestamptz — set on accept
- `expires_at` timestamptz — `accepted_at + duration_days`
- `locked_at` timestamptz — set when expired
- `created_at`, `updated_at`
- RLS: both users can read their own connections

**Note:** Schema needs migration to add `duration_days`, `locked_at` columns and update expiry logic.

#### `notifications` (existing — needs review)

Check current schema for connection-related notification types.

#### `profile_settings` or extend `profiles`

- `default_connection_duration` int (1–30, default 7)

### 6.2 RLS Policies

- `connections`: SELECT for `user_a_id = auth.uid()` OR `user_b_id = auth.uid()`
- `connections`: INSERT for authenticated (no self-connections)
- `connections`: UPDATE only for status changes by either party

---

## 7. API Design

### 7.1 New Endpoints

#### `POST /api/connections`
Send a connection request.

```typescript
// Request
{ targetUserId: string, durationDays: number }

// Response 201
{ connectionId: string, status: 'pending' }

// Response 400: self-connection, already active, etc.
{ error: string }
```

#### `PATCH /api/connections/[id]`
Update connection status.

```typescript
// Request
{ action: 'accept' | 'reject' | 'cancel' | 'renew' }

// Response 200
{ connectionId: string, status: 'active' | 'ended', expiresAt?: string }
```

#### `GET /api/connections`
List user's connections.

```typescript
// Response 200
{
  connections: Array<{
    id: string
    partner: ProfileSummary
    status: 'pending' | 'active' | 'ended' | 'locked'
    durationDays: number
    expiresAt: string | null
    daysLeft: number | null
    isLocked: boolean
  }>
}
```

#### `GET /api/connections/[id]`
Get single connection detail.

#### `GET /api/connections/check?targetUserId=X`
Quick check: does an active connection exist between me and X?

```typescript
// Response 200
{ hasActiveConnection: boolean, connectionId?: string, daysLeft?: number, isLocked?: boolean }
```

### 7.2 Existing Endpoints to Modify

- `GET /api/notifications` — filter by connection events
- `/api/chat` — gate on active connection (read from `connections` check)
- `/api/itinerary/[id]/collaborators` — gate collaborator access on active connection
- `/api/reviews` — gate write on active connection

---

## 8. UI Components

### 8.1 Duration Popup

Appears when user clicks "Connect" on any profile page.

```
┌────────────────────────────────────────┐
│  How long should this connection last? │
│                                        │
│  [ 1 ] [ 7 ] [ 14 ] [ 30 ]  days      │
│                                        │
│  Or enter custom: [    ] days          │
│  (1–30 days)                           │
│                                        │
│  [ Cancel ]          [ Send Request ] │
└────────────────────────────────────────┘
```

- Shows user's default as pre-selected
- Saving preference: "Remember this choice" checkbox (stores to `profiles.default_connection_duration`)

### 8.2 Connect Button States

On any profile page (`/buddies/[id]`, `/tourists/[id]`):

| State | Button | Badge |
|---|---|---|
| `none` | "Connect" | — |
| `pending` (you sent) | "Pending" (disabled) | — |
| `pending` (they sent) | "Accept" / "Reject" | — |
| `active` | "Message" | "Active · Xd left" (green) |
| `active` + warning | "Message" | "Active · 1d left" (amber) |
| `locked` | "Request again" | "Expired" (red) |
| `ended` | "Connect" | — |

### 8.3 Connection Status Badge

On profile header, next to role tag:

- `pending`: amber, "Pending"
- `active`: green, "Active · X days"
- `locked`: red, "Expired"

Hover tooltip on badge explains current state and what to do.

### 8.4 Lock Banner

When visiting chat/itinerary with a locked connection:

```
┌──────────────────────────────────────────────────────────┐
│ ⚠ This connection expired. Renew to continue chatting.  │
│                                         [Renew] [Dismiss]│
└──────────────────────────────────────────────────────────┘
```

- Dismiss hides for session
- Renew triggers `PATCH /api/connections/[id]` with `renew` action

### 8.5 Connections Page (`/connections`)

List of all connections (pending + active + ended). Shows:
- Partner avatar + name
- Status badge
- Days left / expired date
- Actions: Accept / Reject / Cancel / Renew

### 8.6 Notification Items

Connection-related notifications in bell dropdown / `/notifications`:

- Icon + message + timestamp + deep link
- "Accept" / "Reject" action buttons inline for pending requests

---

## 9. Implementation Phases

### Phase 1: Database & Core API
- [ ] Migrate `connections` table (add `duration_days`, `locked_at`, update RLS)
- [ ] Add `profiles.default_connection_duration`
- [ ] Implement `POST /api/connections`
- [ ] Implement `PATCH /api/connections/[id]`
- [ ] Implement `GET /api/connections`
- [ ] Implement `GET /api/connections/check`

### Phase 2: UI — Profile Page
- [ ] Duration popup component
- [ ] Connect button with all states
- [ ] Connection status badge
- [ ] Remove old ConnectButton / connection logic

### Phase 3: Connections Page & Notifications
- [ ] `/connections` page
- [ ] Notification items for all connection events
- [ ] Bell icon badge count

### Phase 4: Lock Enforcement
- [ ] Lock banner component
- [ ] Chat read-only when locked (API gate)
- [ ] Itinerary collaborator lock (API gate)
- [ ] Review write gate

### Phase 5: Polish
- [ ] Settings page: default duration preference
- [ ] "Remember this choice" in duration popup
- [ ] Expiry cron job (mark locked connections)
- [ ] E2E tests

---

## 10. Edge Cases

| Case | Behavior |
|---|---|
| Self-connection attempt | Reject at API level |
| Send request to user already active with you | Show "wants to connect again" to recipient |
| Send request while you have `pending` to same user | No-op (already pending) |
| Cancel `pending` as sender vs receiver | Both can cancel |
| Renew when already locked | Renew from locked → active |
| User A expired, User B still active | B is also locked out of A (per-pair lock) |
| Profile page of locked connection partner | Button shows "Request again" |

---

## 11. Out of Scope (for now)

- Email notifications
- Push notifications (web push)
- Connection request message / intro note
- Connection analytics / stats
- Admin view of all connections
