'use client'

/**
 * useActiveCallStore — cross-page active-call state.
 *
 * Replaces the chat-page-only `callClient` / `callState` / `callPartner`
 * local state. By lifting the call state into a module-level store we
 * can:
 *
 *   1. Mount <ActiveCallSheet /> in AppShell so the call UI persists
 *      when the user navigates away from /chat mid-call.
 *   2. Share mute/end/network state across multiple consumers
 *      (chat page header controls, ActiveCallSheet, tests).
 *   3. Allow the BackgroundCallService (also in AppShell) to inject
 *      inbound signaling messages into the active call via the
 *      `signalHandlers` map.
 *
 * This is a minimal hand-rolled store — no zustand dependency. It
 * uses useSyncExternalStore for component subscriptions and a small
 * pub-sub for change notifications.
 */

import { useCallback, useSyncExternalStore } from 'react'

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

export type NetworkStatus = 'online' | 'reconnecting' | 'offline'

export interface CallQuality {
  level: 'excellent' | 'good' | 'fair' | 'poor'
  bitrateKbps: number
  rttMs: number
  packetLossPct: number
}

export interface ActiveCall {
  callId: string
  conversationId: string
  partnerId: string
  partnerName: string
  partnerAvatar: string | null
  isOutgoing: boolean
  /** 'voice' or 'video' (added 2026-10-01). Defaults to 'voice' for
   *  backward compat with any callers that don't set this. */
  mode?: 'voice' | 'video'
  state: CallState
  networkStatus: NetworkStatus
  quality: CallQuality | null
  errorMessage: string | null
  startedAt: number
}

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'bye' | 'ring'
  callId: string
  from: string
  to: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export type SignalHandler = (msg: SignalMessage) => void

interface State {
  active: ActiveCall | null
  /** Inbound-signal handlers keyed by callId. */
  signalHandlers: Record<string, SignalHandler>
  /** Bumped on any state change so useSyncExternalStore notices. */
  rev: number
}

const listeners = new Set<() => void>()
let state: State = {
  active: null,
  signalHandlers: {},
  rev: 0,
}

function emit(): void {
  state = { ...state, rev: state.rev + 1 }
  for (const l of listeners) l()
}

const setActive = (call: ActiveCall | null) => {
  state = { ...state, active: call }
  emit()
}

const patchActive = (patch: Partial<ActiveCall>) => {
  if (!state.active) return
  state = {
    ...state,
    active: { ...state.active, ...patch },
  }
  emit()
}

const registerSignalHandler = (callId: string, handler: SignalHandler) => {
  state = {
    ...state,
    signalHandlers: { ...state.signalHandlers, [callId]: handler },
  }
  emit()
}

const unregisterSignalHandler = (callId: string) => {
  if (!state.signalHandlers[callId]) return
  const next = { ...state.signalHandlers }
  delete next[callId]
  state = { ...state, signalHandlers: next }
  emit()
}

// Install the actions on the singleton. Done outside React so we can
// read them from non-component code (BackgroundCallService, tests).
// The singleton shape is augmented via the imperative `activeCallStore`
// export below; the in-store State interface only carries data so it
// stays serializable for snapshot comparisons.

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): State {
  return state
}
function getServerSnapshot(): State {
  return state
}

// --- Public hooks ---------------------------------------------------

export function useActiveCallStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useActiveCall(): ActiveCall | null {
  return useActiveCallStore().active
}

/**
 * Imperative API for non-React callers (tests, background services).
 */
export const activeCallStore = {
  getState: () => state,
  setActive,
  patchActive,
  registerSignalHandler,
  unregisterSignalHandler,
}

/**
 * Test/debug only — reset the store to a clean state.
 */
export function __resetActiveCallStoreForTests(): void {
  state = {
    active: null,
    signalHandlers: {},
    rev: 0,
  }
  emit()
}

// Silence the unused-import warning (kept for future use).
void useCallback
