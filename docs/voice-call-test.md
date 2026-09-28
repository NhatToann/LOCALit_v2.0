# Voice-call manual test matrix

This doc walks through the 2-browser tests you should run before each
release. The automated smoke test in
[`scripts/verify-voice-call.mjs`](../scripts/verify-voice-call.mjs)
verifies the server-side plumbing (TURN endpoint, pending_calls,
call_event message insert). It does NOT exercise real audio — that
requires a browser with `getUserMedia` + `RTCPeerConnection`.

## Why we need this

Before 2026-09-28, voice calls had two bugs:
- **Bug 1**: Calls reached `connectionState === 'connected'` but
  played **no audio** — the remote `MediaStream` was captured into a
  local variable on the call-client but never attached to an
  `<audio>` element.
- **Bug 2**: Calls over different networks (e.g. two laptops on
  different ISPs, or one on a mobile hotspot) **failed entirely** —
  the client used a single hardcoded STUN entry, which fails on
  symmetric NAT.

Both are fixed in commit `beef5cf`-or-later. Use the matrix below to
confirm the fixes on every release.

## One-time setup

### Browser console
Open DevTools → Console. Filter by `[call]` to see the diagnostic logs
from `lib/webrtc/call-client.ts`. Every state transition + ICE
candidate is logged in dev mode. In production these are stripped, so
to diagnose a production issue, run with `NODE_ENV=development` or
add a `localStorage.debug='call'` opt-in (TODO).

### Microphone permission
First call on each browser will trigger the permission prompt. Click
"Allow". If you previously blocked, reset in
`chrome://settings/content/microphone` / Safari → Settings → Websites
→ Microphone.

### Open /chat in two browsers
- Browser A (Chrome): signed in as `john.doe@example.com` (tourist).
- Browser B (Firefox or Safari): signed in as `lan.pham@localit.dev`
  (buddy).

Make sure both browsers have an active conversation between them. If
not, run `scripts/seed-accounts.mjs` to ensure they have a shared
conversation.

## Test matrix

For each row, the expected outcome is **call connects AND audio plays
in both directions** unless noted.

| # | Network | Browsers | VPN | Outcome |
|---|---|---|---|---|
| 1 | Same WiFi | Chrome + Chrome | off | Connect, audio |
| 2 | Same WiFi | Chrome + Safari | off | Connect, audio (Safari may default to Opus; check both sides hear each other) |
| 3 | Same WiFi | Chrome + Firefox | off | Connect, audio |
| 4 | Different ISPs (e.g. WiFi + mobile hotspot) | Chrome + Chrome | off | Connect, audio — **this is the test that catches Bug 2**. Before the fix this failed entirely. |
| 5 | Different ISPs, one symmetric NAT (corporate / 4G) | Chrome + Chrome | off | Connect via TURN relay, audio |
| 6 | Different ISPs | Chrome + Chrome | one side on VPN | Connect, audio — VPN adds NAT but TURN must relay through it. If call fails, check `[call] connectionState -> failed` in console. |
| 7 | Same WiFi, but **disable TURN** (set `TURN_URL=` empty in Vercel + redeploy) | Chrome + Chrome | off | Connect on permissive networks (STUN only); expected to fail on symmetric NAT. Use this to confirm the fallback path. |

## What to look for

**Healthy call**:
1. Browser A clicks the phone icon in `/chat`.
2. Browser B sees the IncomingCallWatcher card (top-right).
3. Browser B clicks Accept.
4. Both `[CallModal]`s transition: `Calling…` → `Connecting…` →
   `In call` with a duration counter.
5. Browser A speaks; Browser B hears the voice; vice versa.
6. Either side clicks End. Both `[CallModal]`s show `Call ended` then
   auto-close after ~1.8 s.
7. The conversation log shows a row: `📞 Voice call · N min NN s`.

**Bug 2 regression (failing)**:
- `[CallModal]` reaches `Connecting…` but never `In call`.
- Console shows `[call] connectionState -> failed` within ~5 seconds.
- Conversation log has no call_event row (the call-client never logs
  because `state === 'connected'` was never reached).

**Bug 1 regression (silent)**:
- `[CallModal]` reaches `In call` with timer ticking.
- Neither side hears anything.
- Browser DevTools → Elements → search `<audio>`. If `srcObject` is
  null, the chat page didn't wire the remote stream.

## Verification script

After each deploy, run:

```bash
vercel env ls production | grep -E 'TURN'
# All four should be present (TURN_URL, TURN_REALM, TURN_SHARED_SECRET, TURN_TTL_SECONDS)

$env:API_BASE="https://localit-nhattoann.vercel.app"; \
$env:NEXT_PUBLIC_SUPABASE_URL="https://pqvnjgyqbxlylawwogjv.supabase.co"; \
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE"; \
node scripts/verify-voice-call.mjs
```

Expected:
```
source is 'coturn' or 'stun-only' (got 'coturn')
TURN server present when source=coturn
TURN username has expiry:userid shape
realm is set (got 'turn.localit.dev')
...
N passed, 0 failed
```

If `source: 'stun-only'` shows up on production, one of the four TURN
env vars is missing. Re-add via `vercel env add`.

## Logging in production

The current diagnostic logs are stripped from `process.env.NODE_ENV
=== 'production'` builds. If a user reports a voice-call failure and
you need more detail, add a temporary opt-in:

```js
// lib/webrtc/call-client.ts (already there as a guard)
if (process.env.NODE_ENV === 'production') return
console.debug('[call]', ...)
```

To temporarily re-enable on production for a specific user, set a
cookie and read it inside `dlog()`. For now, the simplest path is to
ask the user to open DevTools while reproducing — the console filter
`[call]` will surface every transition.

## Known limitations

- **Safari iOS** requires a user gesture within 1 second of
  `RTCPeerConnection` creation or the offer is rejected. The current
  flow accepts the gesture via the Accept button click, but iOS
  Safari may still flake. If this happens, click the call button on
  iOS Safari and immediately accept on the other side.
- **No video**: Phase 2 is voice-only. The `CallMode` type is
  restricted to `'voice'` and `MessageSquare`/`Phone` icons reflect
  this.
- **No DTMF / hold / transfer**: out of scope for v1.