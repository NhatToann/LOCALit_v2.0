/**
 * CallActionFooter — shared incoming-call action row used by both
 * the global IncomingCallWatcher popup and the CallModal (when
 * state === 'ringing'). The same three buttons render in the same
 * order with the same labels and colors:
 *
 *   1. Busy       — text only, ink color, surface bg, "send a quick
 *                   reply and decline" semantics (the popup wires it
 *                   to onQuickReply; the modal renders it disabled
 *                   with a tooltip if the caller doesn't expose a
 *                   quick-reply action).
 *   2. Decline    — danger color, surfaces danger-bg on hover.
 *   3. Accept     — success (green) bg, paper text, the primary CTA.
 *
 * Both surfaces pass identical props; the visual is the only thing
 * the consumer wraps (modal = `border-t border-border bg-surface`,
 * popup = same wrapper). This guarantees the UI is one design
 * regardless of where the call is surfaced.
 */
import { MessageSquare, PhoneOff, Phone } from 'lucide-react'

export interface CallActionFooterProps {
  onAccept: () => void
  onDecline: () => void
  onBusy?: () => void
  busyLabel?: string
  busyTitle?: string
  acceptLabel?: string
  declineLabel?: string
  busyDisabled?: boolean
  declineDisabled?: boolean
  size?: 'sm' | 'md'
}

export function CallActionFooter({
  onAccept,
  onDecline,
  onBusy,
  busyLabel = 'Busy',
  busyTitle = 'Send a quick reply and decline',
  acceptLabel = 'Accept',
  declineLabel = 'Decline',
  busyDisabled = false,
  declineDisabled = false,
  size = 'md',
}: CallActionFooterProps) {
  const h = size === 'sm' ? 'h-11' : 'h-12'
  const iconSize = size === 'sm' ? 14 : 16
  return (
    <div className="flex border-t border-border" role="group" aria-label="Call actions">
      {onBusy ? (
        <button
          type="button"
          onClick={onBusy}
          disabled={busyDisabled}
          aria-label={busyTitle}
          title={busyTitle}
          className={`flex-1 inline-flex items-center justify-center gap-2 ${h} text-xs font-medium text-ink bg-surface border-r border-border hover:bg-paper disabled:opacity-50`}
        >
          <MessageSquare size={iconSize} aria-hidden="true" />
          <span className="hidden sm:inline">{busyLabel}</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDecline}
        disabled={declineDisabled}
        aria-label={declineLabel}
        className={`flex-1 inline-flex items-center justify-center gap-2 ${h} text-sm font-medium text-danger bg-surface border-r border-border hover:bg-danger-bg disabled:opacity-50`}
      >
        <PhoneOff size={iconSize} aria-hidden="true" />
        <span className="hidden sm:inline">{declineLabel}</span>
      </button>
      <button
        type="button"
        onClick={onAccept}
        aria-label={acceptLabel}
        className={`flex-1 inline-flex items-center justify-center gap-2 ${h} text-sm font-medium text-paper bg-success hover:opacity-90`}
      >
        <Phone size={iconSize} aria-hidden="true" />
        <span className="hidden sm:inline">{acceptLabel}</span>
      </button>
    </div>
  )
}
