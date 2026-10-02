'use client'

/**
 * OutgoingCallPanel — small floating card the caller sees while
 * waiting for the broker to accept (or while LiveKit handshakes after
 * the broker accepted).
 *
 * Symmetric with IncomingCallWatcher (the broker's corner popup).
 * While the main CallModal owns the audio controls, this card is a
 * glanceable status indicator: who's being called, how long the
 * caller has been waiting, and a single End button so the caller
 * doesn't have to navigate back to the modal to abort.
 *
 * Mounted at AppShell so it persists across navigations, just like
 * IncomingCallWatcher.
 */

import { useEffect, useState } from 'react'
import { PhoneOff, Phone } from 'lucide-react'
import { useActiveCall, activeCallStore } from '@/lib/realtime/useActiveCallStore'
import { Avatar } from '@/components/ui/Avatar'

export default function OutgoingCallPanel() {
  const active = useActiveCall()

  // Only show for outgoing calls (the caller). The receiver has their
  // own IncomingCallWatcher + CallModal flow.
  const visible =
    active != null &&
    active.isOutgoing &&
    (active.state === 'calling' || active.state === 'connecting')

  // Auto-elapsed seconds since startedAt (fallback to Date.now() if
  // not set yet — this matches the activeCallStore.setActive fallback).
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active || !visible) {
      setSeconds(0)
      return
    }
    const baseline = active.startedAt ?? Date.now()
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - baseline) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active?.startedAt, visible, active])

  if (!visible || !active) return null

  const handleEnd = () => {
    activeCallStore.setActive(null)
  }

  return (
    <div
      role="status"
      aria-label={`Outgoing voice call to ${active.partnerName}`}
      className="fixed top-20 right-4 z-[60] w-[min(360px,calc(100vw-2rem))] bg-surface border border-border-strong rounded-sm shadow-[0_2px_8px_rgba(15,15,15,0.08)] overflow-hidden"
    >
      <div className="p-5">
        <p className="text-eyebrow text-primary mb-3">
          {active.state === 'connecting' ? 'Connecting…' : 'Calling…'}
        </p>
        <div className="flex items-center gap-4">
          <Avatar name={active.partnerName} src={active.partnerAvatar} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink truncate">
              {active.partnerName}
            </h2>
            <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
              <Phone size={12} aria-hidden="true" />
              {active.state === 'connecting'
                ? 'Setting up the call…'
                : `Ringing · ${formatElapsed(seconds)}`}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-t border-border">
        <button
          type="button"
          onClick={handleEnd}
          aria-label="End call"
          className="flex-1 h-10 text-sm font-medium text-paper bg-danger hover:opacity-90 inline-flex items-center justify-center gap-2"
        >
          <PhoneOff size={14} aria-hidden="true" />
          End call
        </button>
      </div>
    </div>
  )
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}