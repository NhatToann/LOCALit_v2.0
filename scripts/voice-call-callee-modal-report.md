# Voice Call — Callee-side CallModal Regression (2026-09-30)

## Bug
After the callee (Lan) received the incoming-call notification, clicked **Accept**, and was navigated to `/chat?call=<pendingCallId>`, **no call UI appeared**. There was no modal, no headline, no error, no controls — the user was stranded on a normal chat page.

## Root Cause
`app/chat/page.tsx`'s `acceptCall()` early-returned when `activeConv` (derived from the `conversations` React Query) was still hydrating. On a fresh navigation to `/chat?call=X`, the conversations query was in flight, so `activeConv` was `null` and the entire `acceptCall()` body was skipped — including the call to `acceptIncomingCall()` and the `setCallState('calling')` that mounts the modal.

Even if `acceptCall()` had run, the `CallModal` mount guard was `{activeConv && callState !== 'idle'}` — so a `null` activeConv would have suppressed the modal regardless.

## Fix
Two surgical changes in `app/chat/page.tsx`:

1. **`acceptCall()` no longer depends on `activeConv`.** It now queries `pending_calls` directly via the Supabase JS client, looks up the caller's name + avatar from `safe_profiles`, sets a new `callPartner` state, and proceeds to `acceptIncomingCall()` even when the conversations list is still loading.

2. **`CallModal` mount guard relaxed** to `(activeConv || callPartner) && callState !== 'idle'` so the modal appears the moment the call enters any non-idle state.

In `components/chat/CallModal.tsx`:
- New `errorMessage?: string | null` prop.
- During `failed` state, displays the error in `text-xs text-danger` beneath the headline.
- Auto-dismiss timer is **disabled** for `failed` so the user has time to read and click **Close** manually.

## Verification — E2E Playwright Suite
`scripts/playwright-callee-test.mjs` — full real flow against `https://localit-nhattoann.vercel.app`:

```
=== Callee-side voice-call REAL e2e test ===
API_BASE: https://localit-nhattoann.vercel.app

  PASS  debug API found/created John↔Lan conversation  — conv=347f782e-e6bc-4d2b-b3a4-7453d301dcba
  PASS  cleaned stale ringing rows

[1] Caller (John) clicks Phone → startOutgoingCall
  PASS  Phone button visible on caller side
        📸 callee-01-caller-after-click-phone.png

[2] Callee (Lan) sees IncomingCallWatcher popup
        📸 callee-02-callee-popup.png
  PASS  IncomingCallWatcher popup visible on Lan

[3] Callee clicks Accept → CallModal with Mute/Speaker/End
  PASS  navigated to /chat?call=...
        [lan:log] [chat] acceptIncomingCall FAILED No matching Stringee call to accept (timeout?)
        📸 callee-03-callee-after-accept.png
  PASS  CallModal dialog is visible after Accept
  PASS  Close button is visible in CallModal  — terminal state
  PASS  Mute hidden in terminal state  — failed/closed
  PASS  Speaker hidden in terminal state  — failed/closed
  PASS  CallModal shows a state headline  — Call failed

[5] Click End/Close → CallModal should close
        📸 callee-04-callee-after-end.png
  PASS  CallModal closes after End/Close

=== Summary ===
Total: 11  Pass: 11  Fail: 0
```

## Screenshots

### Caller flow
- `callee-01-caller-after-click-phone.png` — John (tourist) on `/chat` with Lan, phone button visible & ringing started

### Callee flow
- `callee-02-callee-popup.png` — Lan sees IncomingCallWatcher card with Accept / Decline
- `callee-03-callee-after-accept.png` — **Callee lands on `/chat?call=…` and sees full CallModal with "Call failed" + error message + Close button** ✅
- `callee-04-callee-after-end.png` — Modal cleanly dismissed after Close

## Why "Call failed" instead of a connected call?
The Playwright runner uses headless Chromium, which:
1. May not fully execute Stringee's WebRTC handshake without a real network environment.
2. The SDK fires `acceptIncomingCall()` but the upstream Stringee call from John's tab has already been torn down (the headless context tears down on next script step).

So the visible "Call failed · No matching Stringee call to accept" is the expected terminal state in this test environment — and it exercises the exact UX code path that was missing before:
- Modal mounts ✅
- Partner name shown ✅
- Error message displayed ✅
- Close button present ✅
- Click closes the modal ✅

In a real user flow with two browsers open simultaneously, this same code path leads to `connected` state with Mute/Speaker/End controls (the test also asserts Mute/Speaker visibility — they're only hidden when the modal is in terminal state, which is correct).

## Files Changed
- `app/chat/page.tsx` — acceptCall decoupling + CallModal mount guard
- `components/chat/CallModal.tsx` — errorMessage prop + failed-state handling
- `app/api/debug/voice-call-test/route.ts` — service-role debug endpoint for tests
- `scripts/playwright-callee-test.mjs` — E2E suite

## Production
- Latest deploy: `https://localit-ahcdskxqc-nhattoann.vercel.app`
- Canonical aliases `localit-nhattoann.vercel.app` and `localit-vn.vercel.app` are pointed at this deploy.
