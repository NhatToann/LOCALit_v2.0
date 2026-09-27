'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Save, Check, Pencil, Bold, Italic, List, ListOrdered, Link as LinkIcon, Heading2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, Profile } from '@/lib/types'

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
  onTripUpdate: (t: Trip) => void
}

export default function PlanTab({ trip, canEdit, me, onLogActivity, onTripUpdate }: Props) {
  const [notes, setNotes] = useState(trip.itinerary_notes ?? '')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNotes(trip.itinerary_notes ?? '')
  }, [trip.id])

  const scheduleSave = useCallback(
    (next: string) => {
      if (!canEdit) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaving('saving')
      saveTimer.current = setTimeout(async () => {
        const supabase = createClient()
        await supabase
          .from('trips')
          .update({
            itinerary_notes: next,
            itinerary_updated_by: me.id,
            itinerary_updated_at: new Date().toISOString(),
          })
          .eq('id', trip.id)
        setSaving('saved')
        onTripUpdate({ ...trip, itinerary_notes: next, itinerary_updated_by: me.id, itinerary_updated_at: new Date().toISOString() })
        onLogActivity('edited_notes', { length: next.length })
      }, 1200)
    },
    [canEdit, me.id, trip, onLogActivity, onTripUpdate],
  )

  function onChange(v: string) {
    setNotes(v)
    scheduleSave(v)
  }

  function applyMarkdown(prefix: string, suffix: string = prefix) {
    if (!composerRef.current) return
    const ta = composerRef.current
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = notes.slice(0, start)
    const sel = notes.slice(start, end) || 'text'
    const after = notes.slice(end)
    const next = `${before}${prefix}${sel}${suffix}${after}`
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + prefix.length
      ta.selectionEnd = start + prefix.length + sel.length
    })
  }

  function insertDayHeading() {
    const day = `Day ${(notes.match(/Day \d+/g) || []).length + 1}`
    const stamp = `\n\n## ${day}\n\n`
    const next = notes + stamp
    onChange(next)
  }

  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  const lastEditorName =
    trip.itinerary_updated_by === me.id
      ? 'you'
      : trip.itinerary_editor?.full_name ??
        (trip.itinerary_updated_by ? 'your buddy' : null)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Shared plan</h2>
          <p className="text-sm text-muted">
            {lastEditorName
              ? `Last edited by ${lastEditorName}${
                  trip.itinerary_updated_at
                    ? ` · ${new Date(trip.itinerary_updated_at).toLocaleString('en-US')}`
                    : ''
                }`
              : 'No edits yet'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {saving === 'saving' ? (
            <span className="inline-flex items-center gap-1 text-muted">
              <span className="loading-spinner w-3 h-3" aria-hidden="true" />
              Saving…
            </span>
          ) : saving === 'saved' ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Check size={12} aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </div>
      </header>

      {/* Toolbar */}
      {canEdit ? (
        <div className="flex items-center gap-1 flex-wrap border border-border rounded-sm bg-paper p-1">
          <ToolbarBtn onClick={() => applyMarkdown('**')} aria-label="Bold"><Bold size={13} aria-hidden="true" /></ToolbarBtn>
          <ToolbarBtn onClick={() => applyMarkdown('*')} aria-label="Italic"><Italic size={13} aria-hidden="true" /></ToolbarBtn>
          <ToolbarBtn onClick={() => applyMarkdown('## ')} aria-label="Heading"><Heading2 size={13} aria-hidden="true" /></ToolbarBtn>
          <ToolbarBtn onClick={() => applyMarkdown('- ')} aria-label="Bullet list"><List size={13} aria-hidden="true" /></ToolbarBtn>
          <ToolbarBtn onClick={() => applyMarkdown('1. ')} aria-label="Numbered list"><ListOrdered size={13} aria-hidden="true" /></ToolbarBtn>
          <ToolbarBtn onClick={() => applyMarkdown('[', '](https://)')} aria-label="Link"><LinkIcon size={13} aria-hidden="true" /></ToolbarBtn>
          <button
            type="button"
            onClick={insertDayHeading}
            className="ml-2 inline-flex items-center gap-1 h-7 px-2 text-xs rounded-sm bg-info-bg text-info border border-info-bg hover:opacity-80"
          >
            + Day heading
          </button>
        </div>
      ) : null}

      <textarea
        ref={composerRef}
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        rows={14}
        maxLength={8000}
        aria-label="Shared itinerary notes"
        placeholder={
          'Sketch the trip here — both of you can edit.\n\n' +
          '## Day 1 — Arrival\n' +
          '09:00  Meet at Han Market\n' +
          '10:30  Cồn Market for breakfast\n' +
          '14:00  Marble Mountains\n\n' +
          '## Day 2 — Beach\n' +
          '…'
        }
        className="w-full p-3 border border-border rounded-sm bg-paper text-sm text-ink font-mono leading-relaxed focus:outline-none focus:border-primary"
      />

      <p className="text-xs text-muted flex items-center gap-1">
        <Pencil size={11} aria-hidden="true" />
        Autosaves 1.2 s after your last keystroke. Both parties see updates instantly.
      </p>
    </div>
  )
}

function ToolbarBtn({ children, onClick, ...rest }: { children: React.ReactNode; onClick: () => void; 'aria-label': string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center w-7 h-7 text-muted hover:bg-surface rounded-sm"
      {...rest}
    >
      {children}
    </button>
  )
}
