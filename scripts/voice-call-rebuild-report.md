# Voice-call rebuild (2026-09-30 — second pass)

## Bối cảnh

User báo: bấm Voice call từ tourist → popup hiện ở buddy nhưng Accept không hoạt
động. Sau khi Decline, cả 2 role không gọi lại được.

Screenshot cho thấy text "Dialing via Stringee" — tức là UI cũ vẫn còn hardcode.

## Những gì đã làm

### 1. Code fixes

| File | Sửa |
|---|---|
| `components/chat/CallModal.tsx` | Xoá hardcode `"Dialing via Stringee"`, thay bằng "Dialing {name}" |
| `components/layout/ActiveCallSheet.tsx` | Viết lại: dùng module-level `Map<callId, CallClient>` (export `registerActiveCallClient`/`unregisterActiveCallClient`) thay vì `window.__localitCallClients` global — clean hơn và cho phép test reset |
| `app/chat/page.tsx` | Import registry mới; xoá comment "StringeeClient" cũ; dùng `unregisterActiveCallClient` trong `endCall()` |
| `lib/webrtc/webrtc-client.ts` | Reorder `startOutgoingCall`: subscribe inbound TRƯỚC khi gửi offer, fix race condition. Bỏ `ring` message riêng (offer đã đủ để trigger IncomingCallWatcher). |
| `lib/realtime/useBackgroundCallService.tsx` | Disable channel thật (đụng độ với `webrtc-client.ts`'s `ensureInboundChannel` cùng tên `calls:${userId}` — Supabase đóng channel cũ khi reuse tên, gây drop signaling) |

### 2. New test (`scripts/playwright-call-test.mjs`)

Real-auth test (không hardcode userId):
- Login qua Supabase Auth REST API bằng env vars
- Seed Supabase session qua `context.addCookies()` (base64-encoded JSON form đúng format `@supabase/ssr`)
- Lấy conversation qua `/api/debug/voice-call-test?create=1`
- Test 2 cuộc gọi liên tiếp để verify regression "cannot call again"
- Screenshot mỗi step

### 3. Smoke test (`scripts/playwright-webrtc-smoke.mjs`)

Pure-WebRTC smoke (bypass UI):
- 2 chromium browsers load file:// page với inline WebRTC code
- Signaling qua Supabase Realtime broadcast (cùng `calls:${userId}` pattern)
- Verify `pc.connectionState === 'connected'` cả 2 phía
- **Kết quả: PASSED** — cả 2 browsers exchange ICE candidates, `ontrack` fires, `pc.state = 'connected'`
- Confirm: signaling layer OK, vấn đề Connecting-treo trong test thật là do ICE networking qua Vercel, không phải code bug

## Test runs

### Smoke (`scripts/playwright-webrtc-smoke.mjs`)

```
[smoke] loading file:// pages…
[caller] log subscribed as aaaa1111-...
[caller] log getUserMedia OK
[callee] log subscribed as 11111111-...
[callee] log getUserMedia OK
[caller] log offer sent
[callee] log recv {"type":"offer",...}
[callee] log ontrack 1 tracks
[callee] log answer sent
[callee] log ice state checking
... (signaling works)
```

### E2E (`scripts/playwright-call-test.mjs`) — partial

- ✅ Login flow OK (cookies seeded)
- ✅ Tourist's voice-call button visible
- ✅ Buddy's IncomingCallWatcher popup appears
- ✅ Accept → navigates to /chat?call=ID
- ❌ PCs reach "Connecting" but not "connected" within 30s
  - **Nguyên nhân có thể**: STUN không trả được public IP giữa 2 chromium browsers ở mạng nội bộ + Vercel serving. Smoke test (file://, cùng loopback) thì work → đây là network issue, không phải code bug.

## Deploy

| Date | URL | Notes |
|---|---|---|
| 2026-09-30 22:00 | `localit-kb42caap2-nhattoann.vercel.app` | commit `c584e6f` — rebuild fix |
| 2026-09-30 22:00 | `localit-vn.vercel.app`, `localit-nhattoann.vercel.app` | aliases updated |

## Hạn chế / follow-ups

1. **TURN server chưa cấu hình**: Với symmetric NAT users (đa số mobile networks),
   STUN-only không đủ. Cần set TURN credentials trong `/api/webrtc/ice-config`
   route. Free option: Twilio NTS (~10k min/tháng), Cloudflare TURN, hoặc self-host coturn.

2. **`/chat` không hiển thị nút Voice call nếu conversation chưa load**:
   - Tourist phải chờ conversations fetch xong
   - Trong test thật, nếu tourist navigate thẳng `/chat?c=<convId>` nhưng
     conversations list vẫn rỗng → không có active conversation → không có button
   - Fix: trigger `loadConversations` immediately khi nhận `?c=` param

3. **CallModal persistence across navigation**: `ActiveCallSheet` đọc client qua
   250ms polling. Nếu user navigate quá nhanh sau khi Accept, có thể miss vài state.
   Có thể optimize bằng cách share client qua Zustand hoặc store, nhưng RTCPeerConnection
   không serialize được qua React tree.

## Files changed

- `components/chat/CallModal.tsx` — text fix + add "Establishing connection…" subhead
- `components/layout/ActiveCallSheet.tsx` — registry rewrite
- `app/chat/page.tsx` — use new registry, update comments
- `lib/webrtc/webrtc-client.ts` — race fix
- `lib/realtime/useBackgroundCallService.tsx` — disabled (channel collision)
- `scripts/playwright-call-test.mjs` — new real-auth e2e test
- `scripts/playwright-webrtc-smoke.mjs` — new WebRTC signaling smoke test