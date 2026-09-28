# Voice-call manual test matrix

This doc walks through the 2-browser tests you should run before each
release. The automated smoke test in
[`scripts/verify-voice-call.mjs`](../scripts/verify-voice-call.mjs)
verifies the server-side plumbing (Stringee access-token endpoint,
pending_calls, call_event message insert). It does NOT exercise
real audio — that requires a browser with `getUserMedia` and the
Stringee SDK loaded.

## Architecture (2026-09-29 Stringee edition)

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  Caller  │                │ Supabase │                │  Callee  │
└────┬─────┘                └────┬─────┘                └────┬─────┘
     │       INSERT pending_calls  │                          │
     │ status='ringing'           │                          │
     ├───────────────────────────►│                          │
     │                            │  Realtime INSERT event  │
     │                            ├─────────────────────────►│
     │                            │                          │ (popup)
     │  ◄──  UPDATE accepted ────►│◄─────────────────────────┤
     │                            │                          │
     │        ┌──────────┐        │                          │
     │◄──────►│ Stringee │◄──────►│                          │
     │  WebRTC│  SDK     │  WebRTC│                          │
     │  media │ Singapore│  media │                          │
     │        └──────────┘        │                          │
     │                            │                          │
     │       INSERT call_event (after end)                   │
     ├───────────────────────────►│                          │
```

Key choices:
- **Stringee** handles WebRTC peer connection, ICE gathering, TURN
  relay, codec negotiation, and signaling through their Singapore
  servers. No coturn, no STUN/TURN credential plumbing.
- **Supabase `pending_calls` table** still drives the "ringing"
  popup (`IncomingCallWatcher`). Stringee's own `incomingcall`
  event is paired with the DB row by matching the caller's
  Stringee `userId` (== Supabase user id) to the row's
  `caller_id`.
- **`messages` table** still gets a `call_event` row at the end of
  every call (or 'declined' / 'missed' / 'cancelled'). Single source
  of truth for the conversation log.

## Why we need this

Before 2026-09-28, voice calls had two bugs:
- **Bug 1**: Calls reached `connectionState === 'connected'` but
  played **no audio** — the remote `MediaStream` was captured into a
  local variable on the call-client but never attached to an
  `<audio>` element.
- **Bug 2**: Calls over different networks **failed entirely** — the
  client used a single hardcoded STUN entry, which fails on
  symmetric NAT.

Bug 1 was fixed by wiring `audioRef.srcObject = stream` in
`app/chat/page.tsx`. Bug 2 is solved by switching to managed
Stringee (no need to run our own TURN server).

## One-time setup

### Get Stringee API keys
1. Sign up at <https://developer.stringee.com/account/register>.
2. In dashboard, create a project (region: Singapore).
3. Copy **API Key SID** (starts with `SK.…`) and **API Key Secret**.

### Set Vercel env vars (Production + Preview)
```bash
vercel env rm STRINGEE_API_KEY_SID --yes
vercel env add STRINGEE_API_KEY_SID production
# paste: SK.0.xrIw0yUPPlXKDtCjQd8aC3JkpHHHz793
vercel env rm STRINGEE_API_KEY_SECRET --yes
vercel env add STRINGEE_API_KEY_SECRET production
# paste: <base64-secret>
```

Then redeploy (env vars don't trigger rebuild on their own):
```bash
vercel --prod --yes
```

> ⚠️ The Stringee secret is **service-grade**. Never commit it, never
> expose via `NEXT_PUBLIC_*`. Rotate it immediately if leaked.

### Two browsers
- Browser A (Chrome): signed in as `john.doe@example.com` (tourist).
- Browser B (Firefox or Safari): signed in as `lan.pham@localit.dev`
  (buddy).

Make sure both browsers have an active conversation between them.
If not, run `scripts/seed-accounts.mjs`.

### Microphone permission
First call on each browser triggers the permission prompt. Click
"Allow". If blocked, reset in `chrome://settings/content/microphone`.

## Test matrix

For each row, the expected outcome is **call connects AND audio plays
in both directions** unless noted.

| # | Network | Browsers | VPN | Outcome |
|---|---|---|---|---|
| 1 | Same WiFi | Chrome + Chrome | off | Connect, audio |
| 2 | Same WiFi | Chrome + Safari | off | Connect, audio |
| 3 | Same WiFi | Chrome + Firefox | off | Connect, audio |
| 4 | Different ISPs (e.g. WiFi + mobile hotspot) | Chrome + Chrome | off | Connect, audio — **this is the test that proves Stringee's TURN relay works cross-network**. |
| 5 | Different ISPs, symmetric NAT (corporate / 4G) | Chrome + Chrome | off | Connect via Stringee's TURN, audio |
| 6 | Different ISPs | Chrome + Chrome | one side on VPN | Connect, audio |
| 7 | Same WiFi | Chrome + Chrome | off | Watch the console: every state transition + ICE event is logged with `[call:stringee]` prefix in dev mode. |

## What to look for

**Healthy call**:
1. Browser A clicks the phone icon in `/chat`.
2. Browser B sees the IncomingCallWatcher card (top-right, "Incoming voice call · 45s").
3. Browser B clicks Accept.
4. Both `[CallModal]`s transition: `Calling…` → `Connecting…` →
   `In call` with a duration counter.
5. Browser A speaks; Browser B hears the voice; vice versa.
6. Either side clicks End. Both `[CallModal]`s show `Call ended` then
   auto-close after ~1 s.
7. The conversation log shows a row: `📞 Voice call · N min NN s`.

**Bug 1 regression (silent)**:
- `[CallModal]` reaches `In call` with timer ticking.
- Neither side hears anything.
- Browser DevTools → Elements → search `<audio>`. If `srcObject` is
  null, the chat page didn't wire the remote stream. Check
  `app/chat/page.tsx:attachRemoteAudio`.

**Bug 2 regression (failing)**:
- `[CallModal]` reaches `Connecting…` but never `In call`.
- Console shows `[call:stringee] signalingstate 6 Ended` within
  ~5 seconds (Stringee signaling code 6 = ended before connected).
- Conversation log has no call_event row (the call-client never
  logs because `state === 'connected'` was never reached).

**Stringee auth failure**:
- Console shows `[call:stringee] Stringee authen failed: ...`.
- Verify env vars: `vercel env ls production | grep STRINGEE`.

## Verification script

After each deploy, run:

```bash
$env:API_BASE="https://localit-nhattoann.vercel.app"
$env:NEXT_PUBLIC_SUPABASE_URL="https://pqvnjgyqbxlylawwogjv.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE"
node scripts/verify-voice-call.mjs
```

Expected:
```
--- /api/stringee/access-token (authenticated) ---
  OK    authenticated request returned 200 (got 200)
  OK    accessToken is a JWT (3 dot-separated parts)
  OK    JWT userId matches session
  OK    expiresAt is a future unix timestamp
...
N passed, 0 failed
```

If `/api/stringee/access-token` returns 503, the env vars are
missing from Vercel.

## Logging in production

The current diagnostic logs are stripped from `process.env.NODE_ENV
=== 'production'` builds. If a user reports a voice-call failure:

1. Ask them to open DevTools → Console → filter by `[call:stringee]`.
2. If empty, the bundled call-client didn't initialize. Check that
   `/api/stringee/access-token` returns 200 (the SDK can't connect
   without a valid token).

## Known limitations

- **Safari iOS** requires a user gesture within 1 second of
  `connect()` or the offer is rejected. We connect eagerly on page
  load (when `IncomingCallWatcher` mounts), so by the time the user
  clicks Accept, the connection is already established.
- **No video**: Phase 2 is voice-only. The `CallMode` type is
  restricted to `'voice'`.
- **Free plan limit**: 1,500 voice minutes + 4 concurrent calls.
  See https://stringee.com/en/pricing-call. For capstone demo this
  is more than enough. Plan Standard is $660/year if you scale.
- **Free trial restriction**: per Stringee TOS, free tier is for
  internal demo only — not for live deployment with paying users.
  Plan a Standard upgrade before public launch.
- **Vendor lock-in**: switching providers later means rewriting
  `lib/webrtc/call-client.ts`. The current shape (interface
  `CallClient` exposed to chat page) was deliberately kept so a
  future swap to another CPaaS (Agora, Daily, GetStream) is
  bounded.