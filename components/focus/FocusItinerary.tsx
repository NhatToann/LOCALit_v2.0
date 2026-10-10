'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MapPin, Plus, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

interface FocusItineraryProps {
  sessionId: string
  userId: string
  /** Current itinerary already attached to the session, if any */
  initialItineraryId: string | null
  /** Owner of the session (user_a) — used for RLS to decide who can edit */
  onItineraryUpdated?: (itineraryId: string | null) => void
}

interface ItineraryRow {
  id: string
  title: string
  destination: string | null
  start_date: string | null
  end_date: string | null
}

export default function FocusItinerary({
  sessionId,
  userId,
  initialItineraryId,
  onItineraryUpdated,
}: FocusItineraryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialItineraryId)
  const [myItineraries, setMyItineraries] = useState<ItineraryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDestination, setNewDestination] = useState('Da Nang')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data, error: e } = await supabase
          .from('itineraries')
          .select('id, title, destination, start_date, end_date')
          .eq('owner_id', userId)
          .order('start_date', { ascending: false })
          .limit(20)
        if (cancelled) return
        if (e) {
          setError(e.message)
        } else {
          setMyItineraries((data ?? []) as ItineraryRow[])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function persist(id: string | null) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: e } = await supabase
        .from('focus_sessions')
        .update({ itinerary_id: id })
        .eq('id', sessionId)
      if (e) {
        setError(e.message)
        return
      }
      setSelectedId(id)
      onItineraryUpdated?.(id)
    } finally {
      setSaving(false)
    }
  }

  async function createItinerary() {
    if (!newTitle.trim()) {
      setError('Please enter a title for the new itinerary.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('itineraries')
        .insert({
          owner_id: userId,
          title: newTitle.trim(),
          destination: newDestination.trim() || 'Da Nang',
          status: 'planning',
          visibility: 'shared',
        })
        .select('id, title, destination, start_date, end_date')
        .single()
      if (e) {
        setError(e.message)
        return
      }
      setMyItineraries((prev) => [data as ItineraryRow, ...prev])
      setShowCreate(false)
      setNewTitle('')
      await persist(data.id)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-focus-muted inline-flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        Loading itineraries…
      </div>
    )
  }

  return (
    <div className="bg-focus-surface border border-focus-border rounded-sm p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-focus-text">Shared itinerary</h2>
        <p className="text-xs text-focus-muted">
          Plan the trip together. Both of you can edit once it's attached.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-danger mb-3" role="alert">
          {error}
        </p>
      ) : null}

      {selectedId ? (
        <div className="border border-focus-primary bg-focus-bg rounded-sm p-4">
          <div className="flex items-start gap-3 mb-3">
            <MapPin size={16} className="text-focus-primary mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-focus-text">
                {myItineraries.find((i) => i.id === selectedId)?.title ?? 'Attached itinerary'}
              </p>
              <p className="text-xs text-focus-muted">
                {myItineraries.find((i) => i.id === selectedId)?.destination ?? 'Da Nang'}
              </p>
            </div>
            <Link
              href={`/itinerary/${selectedId}`}
              className="text-xs text-focus-primary hover:text-focus-primary-dark"
            >
              Open →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => void persist(null)}
            disabled={saving}
            className="w-full h-9 px-3 text-sm font-medium rounded-sm bg-focus-surface text-focus-darkest border border-focus-border hover:bg-focus-border disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            <X size={14} aria-hidden="true" />
            {saving ? 'Detaching…' : 'Detach from this Focus session'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {myItineraries.length === 0 ? (
              <p className="text-sm text-focus-muted">
                You don't have any itineraries yet. Create one to get started.
              </p>
            ) : (
              myItineraries.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => void persist(it.id)}
                  disabled={saving}
                  className="h-9 px-3 text-sm font-medium rounded-sm bg-focus-surface text-focus-text border border-focus-border hover:border-focus-primary disabled:opacity-50"
                >
                  {it.title}
                </button>
              ))
            )}
          </div>

          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="h-9 px-3 text-sm font-medium rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark inline-flex items-center gap-1"
            >
              <Plus size={14} aria-hidden="true" /> Create new itinerary
            </button>
          ) : (
            <div className="border border-focus-border rounded-sm p-3 bg-focus-bg">
              <div className="mb-2">
                <label className="block text-xs text-focus-muted mb-1" htmlFor="new-title">
                  Title
                </label>
                <input
                  id="new-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-9 px-2 text-sm border border-focus-border rounded-sm bg-focus-surface text-focus-text"
                  placeholder="e.g. Da Nang food tour"
                />
              </div>
              <div className="mb-3">
                <label className="block text-xs text-focus-muted mb-1" htmlFor="new-destination">
                  Destination
                </label>
                <input
                  id="new-destination"
                  type="text"
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  className="w-full h-9 px-2 text-sm border border-focus-border rounded-sm bg-focus-surface text-focus-text"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void createItinerary()}
                  disabled={saving}
                  className="flex-1 h-9 px-3 text-sm font-medium rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create & attach'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="h-9 px-3 text-sm font-medium rounded-sm bg-focus-surface text-focus-text border border-focus-border hover:bg-focus-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
