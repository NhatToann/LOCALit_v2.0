/**
 * Minimal TypeScript declarations for the Stringee Web SDK
 * (https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js).
 *
 * The SDK is a browser global (window.Stringee*) — there is no
 * official @types package, so we declare just the surface we use from
 * `lib/webrtc/call-client.ts`.
 *
 * Reference: https://developer.stringee.com/docs/javascript-sdk/web-stringeecall
 */

declare global {
  interface Window {
    StringeeClient: typeof StringeeClient
    StringeeCall: typeof StringeeCall
    StringeeUtil: typeof StringeeUtil
    __localitStringeeIncomingCalls?: Map<string, IncomingCallEntry>
  }

  interface StringeeAuthenResponse {
    /** 0 = success, non-zero = error */
    r: number
    requestId?: number
    clients?: unknown[]
    connectionId?: number
    ping_after_ms?: number
    projectId?: number
    /** The userId we baked into the access token's JWT claim. */
    userId?: string
    /** STUN/TURN servers (informational — the SDK handles them itself). */
    ice_servers?: RTCIceServer[]
    message?: string
  }

  interface StringeeSignalingState {
    code: number
    reason: string
    sipCode?: number
    sipReason?: string
  }

  interface StringeeMediaState {
    code: number
    description?: string
  }

  interface StringeeInfo {
    /** Custom data the peer sent via call.sendInfo(...). */
    [key: string]: unknown
  }

  interface StringeeCallResponse {
    r: number
    callId?: string
    fromNumber?: string
    toNumber?: string
    toType?: 'internal' | 'external'
    video?: boolean
    message?: string
    requestId?: number
    /** Set on incoming calls so the callee knows if it's app-to-app or
     *  app-to-phone (false = came from a real PSTN number). */
    fromInternal?: boolean
    customDataFromYourServer?: string
  }

  interface IncomingCallEntry {
    call: StringeeCall
    receivedAt: number
  }

  class StringeeUtil {
    static isWebRTCSupported(): boolean
  }

  class StringeeClient {
    constructor()
    on(event: 'connect', cb: () => void): void
    on(event: 'authen', cb: (res: StringeeAuthenResponse) => void): void
    on(event: 'disconnect', cb: () => void): void
    on(event: 'incomingcall', cb: (call: StringeeCall) => void): void
    on(event: 'requestnewtoken', cb: () => void): void
    on(event: 'otherdeviceauthen', cb: (data: unknown) => void): void
    /** Connect to Stringee server using an access_token from /api/stringee/access-token. */
    connect(accessToken: string): void
    /** Disconnect from the server. */
    disconnect(): void
  }

  class StringeeCall {
    constructor(client: StringeeClient, from: string, to: string, isVideoCall?: boolean)
    readonly callId?: string
    /** True for incoming (ringing) calls, false for outgoing. */
    readonly isIncomingCall?: boolean
    /** Phone number / userId that originated the call. */
    readonly fromNumber?: string
    /** Number / userId being called. */
    readonly toNumber?: string
    on(event: 'addlocalstream', cb: (stream: MediaStream) => void): void
    on(event: 'addremotestream', cb: (stream: MediaStream) => void): void
    on(event: 'signalingstate', cb: (state: StringeeSignalingState) => void): void
    on(event: 'mediastate', cb: (state: StringeeMediaState) => void): void
    on(event: 'error', cb: (info: { code?: number; message?: string }) => void): void
    on(event: 'info', cb: (info: StringeeInfo) => void): void
    on(event: 'otherdevice', cb: (data: { type: string; code: number }) => void): void
    /** Initiate an outgoing call. cb.r === 0 means accepted by server. */
    makeCall(cb: (res: StringeeCallResponse) => void): void
    /** Accept an incoming call. */
    answer(cb: (res: StringeeCallResponse) => void): void
    /** Reject an incoming call (before answer). */
    reject(cb: (res: StringeeCallResponse) => void): void
    /** Hang up an active call. */
    hangup(cb: (res: StringeeCallResponse) => void): void
    /** Mute / unmute the local microphone. */
    mute(muted: boolean): void
    /** Send arbitrary data to the peer (e.g. DTMF or custom commands). */
    sendInfo(info: StringeeInfo, cb: (res: StringeeCallResponse) => void): void
  }
}

export {}