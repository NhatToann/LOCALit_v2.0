/**
 * LOCALit voice-call client — Stringee SDK edition (2026-09-29).
 *
 * Migration history:
 *   - 2026-09-28: Self-hosted coturn (lib/webrtc/ice-config.ts +
 *     /api/webrtc/turn + docker-compose). Solved cross-network NAT
 *     failures but required running a TURN server.
 *   - 2026-09-29: Switched to managed Stringee CPaaS. The SDK
 *     handles WebRTC peer connection, ICE gathering, TURN relay,
 *     codec negotiation, and cross-network signaling through
 *     Stringee's Singapore servers. We only need to:
 *       1. Get an access token (POST /api/stringee/access-token)
 *       2. Connect a StringeeClient to the server
 *       3. Make / answer / hang up calls
 *
 * Why we still use pending_calls in the DB:
 *   The IncomingCallWatcher UI listens on the `pending_calls` table
 *   for the "ringing" popup. Stringee's own `client.on('incomingcall')`
 *   event is reliable but the IncomingCallWatcher is mounted globally
 *   in AppShell — using the DB row keeps a single source of truth that
 *   other dashboards (e.g. buddy/requests) can read without needing
 *   the Stringee client connected. We just INSERT pending_calls on
 *   dial, then the Stringee SDK carries the actual media/signaling.
 */

import { createClient as createBrowserClient } from '@/utils/supabase/auth'

const STRINGEE_SDK_URL =
  'https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js'

export type CallMode = 'voice'

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'failed'

/**
 * Coarse connection-quality bucket computed by the `useCallQuality`
 * hook. Used by the CallModal quality strip (signal-bars icon +
 * bitrate/RTT numbers).
 */
export type CallQualityLevel = 'excellent' | 'good' | 'fair' | 'poor'

/**
 * Snapshot of WebRTC stats. Computed by polling
 * `RTCPeerConnection.getStats()` every 2s. `level` is derived from
 * the raw numbers via thresholds in `lib/webrtc/use-call-quality.ts`.
 */
export interface CallQuality {
  level: CallQualityLevel
  /** Inbound audio bitrate in kbps over the last 2s window. */
  bitrateKbps: number
  /** Round-trip-time in ms (from candidate-pair stats). */
  rttMs: number
  /** Packet loss % over the last 2s window. */
  packetLossPct: number
}

/**
 * Browser-level network state. The modal watches `online`/`offline`
 * window events and surfaces a "Reconnecting…" banner so users
 * understand why audio cut out mid-call.
 */
export type NetworkStatus = 'online' | 'reconnecting' | 'offline'

export interface CallClientOptions {
  conversationId: string
  myId: string
  peerId: string
  myName: string
  peerName: string
  mode: CallMode
  /** Existing pending_calls row id, set when accepting an incoming call. */
  pendingCallId?: string
  /**
   * The Stringee userId of the caller (== Supabase userId of the
   * partner in this conversation). Used to look up the queued
   * StringeeCall from the global incoming-call map when accepting.
   */
  callerUserId?: string
  onState?: (s: CallState) => void
  onError?: (e: Error) => void
  onLocalStream?: (s: MediaStream) => void
  onRemoteStream?: (s: MediaStream) => void
  /**
   * Fires whenever the browser-level online state changes. Used by
   * the CallModal to show the "Reconnecting…" banner. Default is a
   * no-op so existing call-sites stay compatible.
   */
  onNetwork?: (status: NetworkStatus) => void
  /**
   * Fires with a new `CallQuality` snapshot. Driven by
   * `useCallQuality` polling `RTCPeerConnection.getStats()`. Only
   * fires after the call reaches `connected` state.
   */
  onQuality?: (q: CallQuality) => void
}

export interface CallClient {
  readonly state: CallState
  /**
   * Browser-level network state. The modal reads this directly to
   * drive its "Reconnecting…" banner. Updated by an internal effect
   * that listens for `window.online`/`window.offline` events.
   */
  readonly networkStatus: NetworkStatus
  /**
   * The native `RTCPeerConnection` for the active call, or `null`
   * before the call connects. The `useCallQuality` hook polls
   * `getStats()` on this object. We expose it here rather than via a
   * getter on the Stringee SDK because Stringee doesn't ship a
   * public API for it.
   */
  readonly peerConnection: RTCPeerConnection | null
  accept: () => Promise<void>
  decline: () => Promise<void>
  toggleMute: () => boolean
  end: () => Promise<void>
}

const DEBUG_TAG = '[call:stringee]'
function dlog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return
  // eslint-disable-next-line no-console
  console.debug(DEBUG_TAG, ...args)
}
function dwarn(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return
  // eslint-disable-next-line no-console
  console.warn(DEBUG_TAG, ...args)
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} min ${String(s).padStart(2, '0')} s`
}

// ---------------------------------------------------------------------------
// SDK loader
// ---------------------------------------------------------------------------

let sdkLoadingPromise: Promise<void> | null = null

/**
 * Dynamically load the Stringee SDK if it isn't on `window` yet.
 *
 * We can't `import 'stringee'` because:
 *   - There's no official @types/stringee package
 *   - The npm `stringee` package depends on a global we don't have at
 *     build time
 *   - The CDN script tag is the documented, supported path
 *
 * The script is idempotent — once loaded, subsequent calls resolve
 * immediately so back-to-back calls don't re-fetch the ~600KB bundle.
 */
export function loadStringeeSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Stringee SDK is browser-only'))
  }
  if (window.StringeeClient && window.StringeeCall) {
    return Promise.resolve()
  }
  if (sdkLoadingPromise) return sdkLoadingPromise
  sdkLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-stringee-sdk="1"]`,
    ) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Stringee SDK')),
      )
      return
    }
    const script = document.createElement('script')
    script.src = STRINGEE_SDK_URL
    script.async = true
    script.dataset.stringeeSdk = '1'
    script.onload = () => resolve()
    script.onerror = () => {
      sdkLoadingPromise = null
      reject(new Error('Failed to load Stringee SDK'))
    }
    document.head.appendChild(script)
  })
  return sdkLoadingPromise
}

// ---------------------------------------------------------------------------
// Access token cache
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string
  expiresAt: number
}
let cachedToken: CachedToken | null = null

/**
 * Fetch an access token from the server. The server verifies the
 * caller has a Supabase session, then signs a JWT with the user's
 * id. Cached until 60 s before expiry to avoid the round-trip on
 * every call.
 */
export async function getStringeeAccessToken(): Promise<{
  accessToken: string
  expiresAt: number
  userId: string
}> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return {
      accessToken: cachedToken.accessToken,
      expiresAt: cachedToken.expiresAt,
      // userId is opaque to the client; recompute from the session
      // when needed by callers.
      userId: '',
    }
  }
  const res = await fetch('/api/stringee/access-token', { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      `Stringee token request failed: ${res.status} ${body.error ?? ''}`,
    )
  }
  const body = (await res.json()) as {
    accessToken: string
    expiresAt: number
    userId: string
  }
  cachedToken = { accessToken: body.accessToken, expiresAt: body.expiresAt }
  return body
}

// ---------------------------------------------------------------------------
// Global StringeeClient (one per page load)
// ---------------------------------------------------------------------------

let globalClient: StringeeClient | null = null
let globalClientAuthedUserId: string | null = null

/**
 * Get or create the StringeeClient for this page load. Connects to
 * Stringee on first use; subsequent calls reuse the same instance.
 *
 * Returns the authenticated StringeeClient and the userId that the
 * SDK associated with the access token (returned in the `authen`
 * event).
 */
export async function ensureStringeeClient(): Promise<{
  client: StringeeClient
  userId: string
}> {
  if (typeof window === 'undefined') {
    throw new Error('Stringee client is browser-only')
  }
  await loadStringeeSdk()
  if (globalClient && globalClientAuthedUserId) {
    return { client: globalClient, userId: globalClientAuthedUserId }
  }
  const client = new window.StringeeClient()
  globalClient = client

  // Set up listeners BEFORE connect so we don't miss the authen event.
  const authenPromise = new Promise<string>((resolve, reject) => {
    const onAuthen = (res: { r: number; userId?: string; message?: string }) => {
      if (res.r === 0 && res.userId) {
        resolve(res.userId)
      } else {
        reject(
          new Error(
            `Stringee authen failed: ${res.message ?? `r=${res.r}`}`,
          ),
        )
      }
    }
    // The TypeScript event overload above is the `on('authen', …)` we
    // declared in types/stringee.d.ts. We bypass the typed surface so
    // this can also fire correctly when the SDK is the CDN version
    // (whose callback shape is `function(res) {...}` with `r: number`).
    ;(client as unknown as { on: (e: string, cb: (r: { r: number; userId?: string; message?: string }) => void) => void }).on(
      'authen',
      onAuthen,
    )
    client.on('requestnewtoken', () => {
      dlog('Stringee requested a new access token; invalidating cache')
      cachedToken = null
    })
  })
  client.on('disconnect', () => {
    dlog('Stringee disconnected')
    globalClient = null
    globalClientAuthedUserId = null
  })

  const { accessToken } = await getStringeeAccessToken()
  client.connect(accessToken)
  const userId = await authenPromise
  globalClientAuthedUserId = userId
  dlog('Stringee client authenticated as', userId)
  return { client, userId }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function logCallEvent(
  supabase: ReturnType<typeof createBrowserClient>,
  conversationId: string,
  actorId: string,
  content: string,
  durationSeconds: number | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: actorId,
    content,
    message_type: 'call_event',
  }
  if (durationSeconds !== null) {
    payload.metadata = { duration_seconds: durationSeconds }
  }
  try {
    await supabase.from('messages').insert(payload)
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content,
      })
      .eq('id', conversationId)
  } catch (err) {
    dwarn('could not log call_event:', err)
  }
}

/**
 * Wire a StringeeCall's events to our CallState callbacks. Returns
 * a setter for `muted` so the caller can toggle mic.
 */
function bindCallEvents(
  call: StringeeCall,
  hooks: {
    onState: (s: CallState) => void
    onLocalStream: (s: MediaStream) => void
    onRemoteStream: (s: MediaStream) => void
  },
): { mute: (muted: boolean) => void } {
  call.on('addlocalstream', (stream) => {
    dlog('addlocalstream', stream.getTracks().length, 'track(s)')
    hooks.onLocalStream(stream)
  })
  call.on('addremotestream', (stream) => {
    dlog('addremotestream', stream.getTracks().length, 'track(s)')
    hooks.onRemoteStream(stream)
  })
  // Stringee signaling codes (subset):
  //   2 = connecting
  //   3 = ringing (callee side)
  //   4 = answered
  //   5 = busy
  //   6 = ended
  //   7 = caller ended
  //   8 = callee ended
  //   20 = rejected
  call.on('signalingstate', (state) => {
    dlog('signalingstate', state.code, state.reason)
    switch (state.code) {
      case 2:
        hooks.onState('connecting')
        break
      case 3:
        hooks.onState('ringing')
        break
      case 4:
        hooks.onState('connected')
        break
      case 5:
        hooks.onState('failed')
        break
      case 6:
      case 7:
      case 8:
      case 20:
        hooks.onState('ended')
        break
    }
  })
  call.on('mediastate', (state) => {
    dlog('mediastate', state.code, state.description ?? '')
  })
  call.on('error', (info) => {
    dwarn('Stringee call error:', info)
  })

  return {
    mute: (muted: boolean) => {
      try {
        call.mute(muted)
      } catch (err) {
        dwarn('mute toggle failed:', err)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the underlying RTCPeerConnection that Stringee created for
 * this call. Stringee SDK attaches the native PC to each
 * MediaStreamTrack as a private `_pc` field (or via a documented
 * `getNativeRTCPeerConnection()` getter on newer builds). We try
 * both shapes so the quality hook works across SDK versions.
 *
 * Returns `null` if we can't find it — the caller should treat
 * `null` as "quality stats unavailable, hide the strip".
 */
function extractPeerConnection(stream: MediaStream | null): RTCPeerConnection | null {
  if (!stream) return null
  const track = stream.getTracks()[0] as
    | (MediaStreamTrack & { _pc?: RTCPeerConnection; getNativeRTCPeerConnection?: () => RTCPeerConnection })
    | undefined
  if (!track) return null
  if (typeof track.getNativeRTCPeerConnection === 'function') {
    try {
      return track.getNativeRTCPeerConnection()
    } catch (err) {
      dwarn('getNativeRTCPeerConnection threw', err)
    }
  }
  return track._pc ?? null
}

/**
 * Wire up `window.online`/`window.offline` listeners for the
 * duration of one call. Returns:
 *   - a getter for the current status
 *   - a teardown function that removes the listeners
 *
 * Status transitions:
 *   - 'online'      — `navigator.onLine === true`
 *   - 'offline'     — `navigator.onLine === false`
 *   - 'reconnecting' — was offline, just came back, but the call
 *                      isn't `connected` yet (user-visible "we're
 *                      trying again…" state)
 */
function attachNetworkWatcher(): {
  getStatus: () => NetworkStatus
  detach: () => void
} {
  if (typeof window === 'undefined') {
    return { getStatus: () => 'online', detach: () => undefined }
  }
  // Start optimistic; flip on first event.
  let last: NetworkStatus = navigator.onLine ? 'online' : 'offline'
  const onOnline = () => {
    last = 'online'
  }
  const onOffline = () => {
    last = 'offline'
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return {
    getStatus: () => last,
    detach: () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    },
  }
}

/**
 * Start an outgoing voice call.
 *
 * 1. INSERT pending_calls row (status='ringing') so the
 *    IncomingCallWatcher shows the popup on the callee's screens.
 * 2. Ensure StringeeClient is connected + authenticated.
 * 3. new StringeeCall(client, from=myName, to=peerId) and makeCall().
 * 4. When callee accepts, Stringee signals code=4 → we set state
 *    to 'connected' and the chat page's onRemoteStream callback
 *    attaches the stream to the <audio> element.
 */
export async function startOutgoingCall(
  opts: CallClientOptions,
): Promise<{ client: CallClient; pendingCallId: string }> {
  const onState = opts.onState ?? (() => {})
  const onError = opts.onError ?? (() => {})
  const onLocalStream = opts.onLocalStream ?? (() => {})
  const onRemoteStream = opts.onRemoteStream ?? (() => {})
  const onNetwork = opts.onNetwork
  const onQuality = opts.onQuality

  const supabase = createBrowserClient()
  let state: CallState = 'calling'
  let connectedAt: number | null = null
  let stringeeCall: StringeeCall | null = null
  let muted = false
  let pendingCallId: string | null = null
  let ended = false
  let remoteStream: MediaStream | null = null
  let peerConn: RTCPeerConnection | null = null
  const network = attachNetworkWatcher()
  let networkStatus: NetworkStatus = network.getStatus()
  // Re-fire onNetwork whenever it changes so the modal can update.
  const emitNetwork = () => {
    const next = network.getStatus()
    if (next === networkStatus) return
    networkStatus = next
    onNetwork?.(next)
  }
  // After coming back online mid-call, hold the 'reconnecting'
  // label until we either see another 'connected' signaling or the
  // call ends. The watcher below polls every second.
  const reconcileNetwork = setInterval(() => {
    const next = network.getStatus()
    if (next === 'online' && state !== 'connected' && networkStatus !== 'online') {
      onNetwork?.('reconnecting')
    }
    emitNetwork()
  }, 1000)

  function setState(s: CallState) {
    dlog('state', state, '->', s, '(outgoing)')
    state = s
    onState(s)
  }

  // 1. DB row first so the watcher can find it.
  const { data: insertData, error: insertErr } = await supabase
    .from('pending_calls')
    .insert({
      conversation_id: opts.conversationId,
      caller_id: opts.myId,
      callee_id: opts.peerId,
      status: 'ringing',
    })
    .select('id')
    .single()
  if (insertErr || !insertData) {
    throw new Error('Could not start call: ' + (insertErr?.message ?? 'unknown'))
  }
  pendingCallId = insertData.id

  // 2. Connect Stringee client (idempotent).
  const { client } = await ensureStringeeClient()

  // 3. Build the call. For app-to-app calls, `from` MUST be the
  // caller's Stringee User ID (== our Supabase auth.users.id, baked
  // into the JWT's `userId` claim). Passing the display name
  // ("John Doe") instead causes Stringee to return
  // FROM_NUMBER_NOT_FOUND (error code 4) because no such alias
  // exists on the project. `to` is the callee's Stringee User ID.
  const call = new window.StringeeCall(client, opts.myId, opts.peerId, false)
  stringeeCall = call

  const { mute } = bindCallEvents(call, {
    onState: (s) => {
      if (s === 'connected') {
        connectedAt = Date.now()
        setState('connected')
        // As soon as we hit 'connected', extract the underlying
        // RTCPeerConnection so the quality hook can start polling.
        // Done after a microtask so Stringee has had a chance to
        // attach `_pc` to the track.
        if (!peerConn) {
          const pc = extractPeerConnection(remoteStream)
          if (pc) peerConn = pc
        }
      } else if (s === 'ended') {
        // On remote end, we still want to log the call event and
        // close the modal. Don't call end() recursively.
        void handleRemoteEnded()
      } else {
        setState(s)
      }
    },
    onLocalStream,
    onRemoteStream: (s) => {
      remoteStream = s
      // Capture PC early — `addremotestream` may fire before the
      // 'connected' signaling state on some SDK versions.
      if (!peerConn) {
        const pc = extractPeerConnection(s)
        if (pc) peerConn = pc
      }
      onRemoteStream(s)
    },
  })

  // Ring timeout: if callee doesn't accept in 45 s, mark missed.
  const ringTimer = setTimeout(() => {
    if (state === 'calling') {
      dlog('ring timeout; marking missed')
      setState('missed')
      void markPendingTerminal('expired')
      void logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        '📞 Voice call · missed',
        null,
      )
      void end()
    }
  }, 45_000)

  async function markPendingTerminal(terminalStatus: string) {
    if (!pendingCallId) return
    try {
      await supabase
        .from('pending_calls')
        .update({ status: terminalStatus })
        .eq('id', pendingCallId)
    } catch (err) {
      dwarn('markPendingTerminal failed', err)
    }
  }

  async function handleRemoteEnded() {
    if (ended) return
    ended = true
    clearTimeout(ringTimer)
    const dur = connectedAt
      ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      : 0
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    } else if (state === 'connected') {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        '📞 Voice call · ended',
        0,
      )
    }
    if (pendingCallId) {
      await markPendingTerminal('accepted')
    }
  }

  async function end(): Promise<void> {
    if (ended) return
    ended = true
    clearTimeout(ringTimer)
    clearInterval(reconcileNetwork)
    network.detach()
    if (stringeeCall) {
      await new Promise<void>((resolve) => {
        try {
          stringeeCall!.hangup(() => resolve())
        } catch {
          resolve()
        }
        // Safety net in case the callback never fires.
        setTimeout(resolve, 2000)
      })
    }
    const dur = connectedAt
      ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      : 0
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    } else if (state === 'connected') {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        '📞 Voice call · ended',
        0,
      )
    } else if (state === 'calling' || state === 'connecting') {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        '📞 Voice call · cancelled',
        null,
      )
    }
    if (pendingCallId) {
      const terminal = state === 'connected' ? 'accepted' : 'cancelled'
      await markPendingTerminal(terminal)
    }
    setState('ended')
  }

  // 4. Kick off the call.
  await new Promise<void>((resolve, reject) => {
    try {
      call.makeCall((res) => {
        dlog('makeCall res', res)
        if (res.r !== 0) {
          reject(new Error(res.message ?? `makeCall failed (r=${res.r})`))
        } else {
          resolve()
        }
      })
    } catch (err) {
      reject(err as Error)
    }
  })

  const clientObj: CallClient = {
    get state() {
      return state
    },
    get networkStatus() {
      return networkStatus
    },
    get peerConnection() {
      return peerConn
    },
    accept: async () => {
      // Caller side does not accept; this is a no-op for type compat.
    },
    decline: async () => {
      if (state !== 'calling') return
      setState('declined')
      await end()
    },
    toggleMute: () => {
      muted = !muted
      mute(muted)
      return muted
    },
    end,
  }
  return { client: clientObj, pendingCallId: pendingCallId! }
}

/**
 * Accept an incoming voice call. The Stringee call object is already
 * created by `client.on('incomingcall', ...)` — we accept the one
 * passed via the global handler by matching it on `toNumber` (== my
 * userId). To keep the public API simple, the caller is responsible
 * for having registered the global handler before this is called
 * (see app/chat/page.tsx). If no match is found, we throw.
 */
export async function acceptIncomingCall(
  opts: CallClientOptions,
): Promise<{ client: CallClient }> {
  if (!opts.pendingCallId) {
    throw new Error('acceptIncomingCall requires pendingCallId')
  }
  const onState = opts.onState ?? (() => {})
  const onError = opts.onError ?? (() => {})
  const onLocalStream = opts.onLocalStream ?? (() => {})
  const onRemoteStream = opts.onRemoteStream ?? (() => {})
  const onNetwork = opts.onNetwork

  const supabase = createBrowserClient()
  let state: CallState = 'connecting'
  let connectedAt: number | null = null
  let muted = false
  let ended = false
  let remoteStream: MediaStream | null = null
  let peerConn: RTCPeerConnection | null = null
  const network = attachNetworkWatcher()
  let networkStatus: NetworkStatus = network.getStatus()
  const emitNetwork = () => {
    const next = network.getStatus()
    if (next === networkStatus) return
    networkStatus = next
    onNetwork?.(next)
  }
  const reconcileNetwork = setInterval(() => {
    const next = network.getStatus()
    if (next === 'online' && state !== 'connected' && networkStatus !== 'online') {
      onNetwork?.('reconnecting')
    }
    emitNetwork()
  }, 1000)

  function setState(s: CallState) {
    dlog('state', state, '->', s, '(incoming)')
    state = s
    onState(s)
  }

  // 1. Update DB so the watcher hides.
  const { error: updateErr } = await supabase
    .from('pending_calls')
    .update({ status: 'accepted' })
    .eq('id', opts.pendingCallId)
    .eq('callee_id', opts.myId)
  if (updateErr) {
    throw new Error('Could not accept call: ' + updateErr.message)
  }

  // 2. Find the matching StringeeCall from the global incoming-call
  // queue. We store the Stringee call keyed by the caller's userId
  // (their Stringee `fromNumber`), which the caller is set to via
  // the access-token JWT `userId` claim. The chat page passes the
  // active conversation's partner_id as `callerUserId`.
  const lookupKey = opts.callerUserId ?? opts.peerId
  if (!lookupKey) {
    throw new Error('acceptIncomingCall requires callerUserId or peerId')
  }
  const call = consumePendingStringeeCall(lookupKey)
  if (!call) {
    throw new Error('No matching Stringee call to accept (timeout?)')
  }

  const { mute } = bindCallEvents(call, {
    onState: (s) => {
      if (s === 'connected') {
        connectedAt = Date.now()
        setState('connected')
        if (!peerConn) {
          const pc = extractPeerConnection(remoteStream)
          if (pc) peerConn = pc
        }
      } else if (s === 'ended') {
        void handleRemoteEnded()
      } else {
        setState(s)
      }
    },
    onLocalStream,
    onRemoteStream: (s) => {
      remoteStream = s
      if (!peerConn) {
        const pc = extractPeerConnection(s)
        if (pc) peerConn = pc
      }
      onRemoteStream(s)
    },
  })

  async function handleRemoteEnded() {
    if (ended) return
    ended = true
    const dur = connectedAt
      ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      : 0
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    }
    if (opts.pendingCallId) {
      try {
        await supabase
          .from('pending_calls')
          .update({ status: 'accepted' })
          .eq('id', opts.pendingCallId)
      } catch (err) {
        dwarn('pending_calls final update failed', err)
      }
    }
  }

  async function end(): Promise<void> {
    if (ended) return
    ended = true
    clearInterval(reconcileNetwork)
    network.detach()
    const c: StringeeCall = call!
    try {
      await new Promise<void>((resolve) => {
        try {
          c.hangup(() => resolve())
        } catch {
          resolve()
        }
        setTimeout(resolve, 2000)
      })
    } catch (err) {
      dwarn('hangup threw', err)
    }
    const dur = connectedAt
      ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      : 0
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    }
    if (opts.pendingCallId) {
      try {
        await supabase
          .from('pending_calls')
          .update({ status: state === 'connected' ? 'accepted' : 'cancelled' })
          .eq('id', opts.pendingCallId)
      } catch (err) {
        dwarn('pending_calls final update failed', err)
      }
    }
    setState('ended')
  }

  // 3. Answer the call.
  await new Promise<void>((resolve, reject) => {
    try {
      call.answer((res) => {
        dlog('answer res', res)
        if (res.r !== 0) {
          reject(new Error(res.message ?? `answer failed (r=${res.r})`))
        } else {
          resolve()
        }
      })
    } catch (err) {
      reject(err as Error)
    }
  })

  const clientObj: CallClient = {
    get state() {
      return state
    },
    get networkStatus() {
      return networkStatus
    },
    get peerConnection() {
      return peerConn
    },
    accept: async () => {
      // Already accepting on construction; no-op.
    },
    decline: async () => {
      // No-op for callee after answer.
    },
    toggleMute: () => {
      muted = !muted
      mute(muted)
      return muted
    },
    end,
  }
  return { client: clientObj }
}

/**
 * Decline an incoming call (callee-side, before accepting).
 */
export async function declineIncomingCall(opts: {
  supabase: ReturnType<typeof createBrowserClient>
  pendingCallId: string
  myId: string
  conversationId: string
  callerId: string
}): Promise<void> {
  // Mark DB row as declined.
  await opts.supabase
    .from('pending_calls')
    .update({ status: 'declined' })
    .eq('id', opts.pendingCallId)
    .eq('callee_id', opts.myId)

  // If we have a queued Stringee call for this caller, reject it.
  const call = consumePendingStringeeCall(opts.callerId)
  if (call) {
    try {
      await new Promise<void>((resolve) => {
        try {
          call.reject(() => resolve())
        } catch {
          resolve()
        }
        setTimeout(resolve, 2000)
      })
    } catch (err) {
      dwarn('reject threw', err)
    }
  }

  await logCallEvent(
    opts.supabase,
    opts.conversationId,
    opts.myId, // actor (callee) — must match auth.uid() for RLS
    '📞 Voice call · declined',
    null,
  )
}

// ---------------------------------------------------------------------------
// Global incoming-call queue
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __localitStringeeIncomingCalls?: Map<string, IncomingCallEntry>
  }
}

function incomingMap(): Map<string, IncomingCallEntry> {
  if (typeof window === 'undefined') return new Map()
  if (!window.__localitStringeeIncomingCalls) {
    window.__localitStringeeIncomingCalls = new Map()
  }
  return window.__localitStringeeIncomingCalls
}

function readPendingStringeeCall(conversationId: string): StringeeCall | null {
  return incomingMap().get(conversationId)?.call ?? null
}

function consumePendingStringeeCall(conversationId: string): StringeeCall | null {
  const entry = incomingMap().get(conversationId)
  if (!entry) return null
  incomingMap().delete(conversationId)
  return entry.call
}

/**
 * Register a one-time listener on the global StringeeClient that
 * queues incoming StringeeCall objects keyed by the caller's
 * userId (== fromNumber for app-to-app calls). The IncomingCallWatcher
 * matches the queued call to a pending_calls row by caller_id.
 *
 * Returns a teardown function. In practice the global StringeeClient
 * lives for the page lifetime so we don't aggressively tear down —
 * the watcher just stops consuming from the map.
 */
export function startIncomingCallWatcher(
  onIncomingCall: (entry: {
    call: StringeeCall
    callerUserId: string
  }) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (!globalClient) {
    // The chat page might not have called ensureStringeeClient yet.
    // Kick it off and re-register after the SDK is ready.
    void ensureStringeeClient().then(() => {
      startIncomingCallWatcher(onIncomingCall)
    })
    return () => undefined
  }
  const handler = (call: StringeeCall) => {
    const caller = call.fromNumber ?? ''
    dlog('incoming Stringee call from', caller)
    incomingMap().set(caller, { call, receivedAt: Date.now() })
    try {
      onIncomingCall({ call, callerUserId: caller })
    } catch (err) {
      dwarn('onIncomingCall handler threw:', err)
    }
  }
  ;(
    globalClient as unknown as {
      on: (e: string, cb: (c: StringeeCall) => void) => void
    }
  ).on('incomingcall', handler)
  return () => undefined
}

/** Test/debug only — empty the incoming-call queue. */
export function __resetIncomingCallsForTests(): void {
  incomingMap().clear()
}