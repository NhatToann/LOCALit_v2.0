# Focus Mode rewrite (2026-10-10)

## Problem

The current `/app/focus/[sessionId]/page.tsx` was a thin stub that:

- Showed a custom SVG "map" (not a real map) — `components/focus/FocusMap.tsx`.
- Had a "back to chat" arrow in the header (defeats the "you can't leave
  except by ending the session" contract the user described).
- Showed a "Phone" button that requested a brand-new LiveKit call
  (rings the partner, requires both sides to accept, etc.) — but the
  user wants Focus Mode to have mic-on by default for the duration
  (no ringing, no accept handshake).
- Showed a chat tab that only linked out to `/chat?conv=<id>` instead
  of embedding the conversation.

## Goal

Focus Mode becomes a **locked-in, fully-immersive session** with:

1. **Real Leaflet map** — copy `components/map/MapView.tsx` from
   `/dashboard`, render it inline at the top of the focus page.
2. **No back button** — the only exit is "End Focus" or close the
   browser tab. We still allow Esc to fire the End confirmation
   (matching the AGENTS.md note that "you can't exit except by ending
   the session or closing the browser").
3. **Auto-publish mic on entry** — when the user enters Focus Mode,
   the LiveKit room is joined and `publishMic()` is called
   immediately (no ringing, no Accept). The mic icon in the header
   toggles mute / unmute. Mic state is per-side (one side muted
   does not affect the other).
4. **Auto-share live location on entry** — `useLiveUserLocations`
   with `enabled: true` so the partner sees your pin on the map.
   A toggle in the header lets you turn this off without ending
   the session.
5. **Embedded chat with bubble UI** — copy the chat page's
   message-bubble component, render it inside Focus Mode. The
   existing `conversations` / `messages` tables are shared so the
   same conversation is visible in both `/chat` and `/focus/[id]`.
6. **Copy the existing call feature for voice calls** — the
   header still has a Call button that uses the same
   `startLiveKitCall` flow as the chat page (rings the partner,
   waits for accept, then a full-duplex call). The difference
   is: this is *separate* from the always-on mic. The always-on
   mic uses the same LiveKit room (`call:<conversationId>`) but
   joins silently; the "Call" button re-uses the same room with
   the full ringing flow.

## Architecture

### Page layout

```
<header>
  Partner avatar + name + "Focus with <name>" + elapsed timer
  [Mute mic]  [Toggle location]  [Call]  [End Focus]
</header>
<LiveMap>           ← MapView copy
  - Self pin (you)
  - Partner pin
  - Other Da Nang pins (so the partners see Da Nang context)
</LiveMap>
<ChatBubbles>       ← New components/focus/FocusChat.tsx
  [Message list]  [Send input]
</ChatBubbles>
```

### Files to change

| File | Change |
|---|---|
| `app/focus/[sessionId]/page.tsx` | Full rewrite. New header, embed MapView, FocusChat, mic-on-by-default, no back button. |
| `components/focus/FocusMap.tsx` | **Delete** — replaced by inline MapView. |
| `components/focus/FocusMapLeaflet.tsx` | **New** — thin wrapper around MapView that scopes to just the two focus participants. |
| `components/focus/FocusChat.tsx` | **New** — embedded chat with bubble UI, using the same `conversations` table. |
| `hooks/useFocusAutoMedia.ts` | **New** — auto-joins LiveKit room + auto-shares location on Focus entry. |
| `app/api/focus/[sessionId]/join/route.ts` | **New** — mints a LiveKit token for the focus session (scoped to the conversation room). |

### Behaviour

- **Mic on entry**: hook calls `startLiveKitCall` with
  `roomName: call:<conversationId>`, immediately calls
  `publishMic()`. The mic icon in the header reads the muted
  state from the LiveKit client and toggles it on click.
- **Location on entry**: `useLiveUserLocations({ enabled: true,
  selfUserId: me.id })`. The map shows your pin and your
  partner's pin. Other live broadcasters are also visible (so
  both sides see Da Nang context).
- **Chat on entry**: `useMessageStream(conversationId, initial)`
  hydrates from the same `messages` table. New messages appear
  in real time. Sending a message goes to
  `POST /api/conversations/:id/messages` (the same endpoint
  `/chat` uses).
- **Call button**: identical to chat's `startCall('voice')`. The
  room name is `call:<conversationId>` (same as the always-on
  mic). The always-on mic and the call share the LiveKit room —
  if both are unmuted and the call is connected, the call
  surface replaces the always-on mic surface.
- **End Focus**: POST `/api/focus/[sessionId]/end` (existing),
  then `router.replace('/chat')`. The always-on mic is ended
  by `dispose()` inside the LiveKit client.

## Decisions (user confirmed)

| Decision | Choice |
|---|---|
| Mic on entry | **On by default** — auto-request permission, start broadcasting immediately |
| Location share | **On by default** with a toggle to turn off |
| Chat source | **Existing conversation** table — share messages with regular chat |

## Out of scope

- Push notifications when partner joins Focus.
- WebRTC video (voice-only for now).
- End-to-end encryption of the always-on mic stream.
