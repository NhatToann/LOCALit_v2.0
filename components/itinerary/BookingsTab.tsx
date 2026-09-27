'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripBooking, TripBudgetItem, Profile } from '@/lib/types'
import { Plus, X, Trash2, Plane, Hotel, Utensils, Compass, Train, FileText, Receipt } from 'lucide-react'

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

const BOOKING_TYPES: Array<{ id: TripBooking['type']; label: string; Icon: typeof Plane }> = [
  { id: 'flight', label: 'Flight', Icon: Plane },
  { id: 'hotel', label: 'Hotel', Icon: Hotel },
  { id: 'restaurant', label: 'Restaurant', Icon: Utensils },
  { id: 'tour', label: 'Tour', Icon: Compass },
  { id: 'transport', label: 'Transport', Icon: Train },
  { id: 'other', label: 'Other', Icon: FileText },
]

const BUDGET_CATEGORIES = ['food', 'transport', 'tickets', 'shopping', 'stay', 'other'] as const

export default function BookingsTab({ trip, canEdit, me, onLogActivity }: Props) {
  const [bookings, setBookings] = useState<TripBooking[]>([])
  const [expenses, setExpenses] = useState<TripBudgetItem[]>([])
  const [showBooking, setShowBooking] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [trip.id])

  useEffect(() => {
    if (!trip) return
    const supabase = createClient()
    const ch = supabase
      .channel(`bookings-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_bookings', filter: `trip_id=eq.${trip.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_budget', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [trip.id])

  async function load() {
    const supabase = createClient()
    const [{ data: b }, { data: e }] = await Promise.all([
      supabase.from('trip_bookings').select('*').eq('trip_id', trip.id).order('start_at', { ascending: true, nullsFirst: false }),
      supabase.from('trip_budget').select('*').eq('trip_id', trip.id).order('spent_at', { ascending: false, nullsFirst: false }),
    ])
    setBookings((b as TripBooking[]) || [])
    setExpenses((e as TripBudgetItem[]) || [])
    setLoading(false)
  }

  async function addBooking(form: FormData) {
    if (!canEdit) return
    const type = form.get('type') as TripBooking['type']
    const supabase = createClient()
    await supabase.from('trip_bookings').insert({
      trip_id: trip.id,
      type,
      provider: (form.get('provider') as string)?.trim() || null,
      confirmation_code: (form.get('code') as string)?.trim() || null,
      start_at: (form.get('start') as string) || null,
      end_at: (form.get('end') as string) || null,
      location_name: (form.get('location') as string)?.trim() || null,
      cost_cents: Math.round(Number(form.get('cost') || 0) * 100),
      currency: (form.get('currency') as string) || 'USD',
      notes: (form.get('notes') as string)?.trim() || null,
      added_by: me.id,
    })
    onLogActivity('added_booking', { type, location: form.get('location') })
    setShowBooking(false)
    load()
  }

  async function deleteBooking(id: string) {
    if (!canEdit) return
    if (!confirm('Delete this booking?')) return
    const supabase = createClient()
    await supabase.from('trip_bookings').delete().eq('id', id)
    load()
  }

  async function addExpense(form: FormData) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_budget').insert({
      trip_id: trip.id,
      category: form.get('category') as TripBudgetItem['category'],
      description: (form.get('description') as string)?.trim() || null,
      amount_cents: Math.round(Number(form.get('amount') || 0) * 100),
      currency: (form.get('currency') as string) || 'USD',
      paid_by: me.id,
      spent_at: (form.get('spent_at') as string) || new Date().toISOString(),
    })
    onLogActivity('added_expense', { category: form.get('category'), amount: form.get('amount') })
    setShowExpense(false)
    load()
  }

  async function deleteExpense(id: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_budget').delete().eq('id', id)
    load()
  }

  const totalSpent = expenses.reduce((acc, e) => acc + e.amount_cents, 0)
  const tripBudget = trip.budget_total_cents || 0
  const remaining = tripBudget - totalSpent
  const splitPerPerson = expenses.length > 0 ? Math.round(totalSpent / 2) : 0 // both tourist + buddy

  if (loading) return <div className="loading-spinner mx-auto my-8" />

  return (
    <div className="space-y-6">
      {/* BOOKINGS */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Bookings</h2>
            <p className="text-sm text-muted">Flights, hotels, restaurants, tours. Both can edit.</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowBooking((s) => !s)}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              <Plus size={13} aria-hidden="true" /> Add booking
            </button>
          ) : null}
        </header>

        {showBooking ? (
          <BookingForm onSubmit={addBooking} onCancel={() => setShowBooking(false)} />
        ) : null}

        {bookings.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-6 text-center bg-paper">
            <p className="text-sm text-muted">No bookings yet. Add flights, hotels, and reservations here so the trip is fully tracked.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bookings.map((b) => {
              const typeInfo = BOOKING_TYPES.find((t) => t.id === b.type) ?? BOOKING_TYPES[5]
              const Icon = typeInfo.Icon
              return (
                <li
                  key={b.id}
                  className="border border-border rounded-sm bg-surface p-4 flex items-start gap-3"
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-info-bg text-info border border-info-bg flex-shrink-0">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{b.location_name ?? typeInfo.label}</p>
                      {b.cost_cents > 0 ? (
                        <span className="text-xs font-medium text-success whitespace-nowrap">
                          {b.currency} {(b.cost_cents / 100).toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">
                      {typeInfo.label}
                      {b.provider ? ` · ${b.provider}` : ''}
                    </p>
                    {b.confirmation_code ? (
                      <p className="text-xs text-ink mt-1">
                        Code: <span className="font-mono">{b.confirmation_code}</span>
                      </p>
                    ) : null}
                    {b.start_at ? (
                      <p className="text-xs text-muted mt-1">
                        {new Date(b.start_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    ) : null}
                    {b.notes ? <p className="text-xs text-muted mt-1 line-clamp-2">{b.notes}</p> : null}
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => deleteBooking(b.id)}
                      aria-label="Delete booking"
                      className="text-muted hover:text-danger flex-shrink-0"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* BUDGET */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Budget</h2>
            <p className="text-sm text-muted">Track expenses together.</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowExpense((s) => !s)}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              <Plus size={13} aria-hidden="true" /> Add expense
            </button>
          ) : null}
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatTile
            label="Total budget"
            value={tripBudget > 0 ? `${trip.currency} ${(tripBudget / 100).toFixed(0)}` : '—'}
            sub={tripBudget > 0 ? 'Planned' : 'Set a budget'}
            color="primary"
          />
          <StatTile
            label="Spent"
            value={`${trip.currency} ${(totalSpent / 100).toFixed(2)}`}
            sub={`${expenses.length} item${expenses.length === 1 ? '' : 's'}`}
            color="info"
          />
          <StatTile
            label="Remaining"
            value={tripBudget > 0 ? `${trip.currency} ${(remaining / 100).toFixed(2)}` : '—'}
            sub={remaining < 0 ? 'Over budget' : 'In budget'}
            color={remaining < 0 ? 'danger' : 'success'}
          />
          <StatTile
            label="Per person"
            value={`${trip.currency} ${(splitPerPerson / 100).toFixed(2)}`}
            sub="Split 2 ways"
            color="muted"
          />
        </div>

        {/* Progress bar */}
        {tripBudget > 0 ? (
          <div className="mb-4">
            <div className="w-full h-2 bg-paper border border-border rounded-sm overflow-hidden">
              <div
                className={`h-full ${remaining < 0 ? 'bg-danger' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, Math.round((totalSpent / tripBudget) * 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1">
              {Math.round((totalSpent / tripBudget) * 100)}% used
            </p>
          </div>
        ) : null}

        {showExpense ? (
          <ExpenseForm onSubmit={addExpense} onCancel={() => setShowExpense(false)} currency={trip.currency} />
        ) : null}

        {expenses.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-6 text-center bg-paper">
            <p className="text-sm text-muted">No expenses tracked yet.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-3 py-2 border border-border rounded-sm bg-surface"
              >
                <Receipt size={14} className="text-muted" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{e.description ?? e.category}</p>
                  <p className="text-[11px] text-muted">
                    {e.category}
                    {e.spent_at ? ` · ${new Date(e.spent_at).toLocaleDateString('en-US')}` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium text-ink">
                  {e.currency} {(e.amount_cents / 100).toFixed(2)}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => deleteExpense(e.id)}
                    aria-label="Delete expense"
                    className="text-muted hover:text-danger"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function BookingForm({ onSubmit, onCancel }: { onSubmit: (form: FormData) => void; onCancel: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
      className="border border-border rounded-sm bg-surface p-4 mb-4 space-y-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <FormField label="Type" required>
          <select name="type" required className="form-input">
            {BOOKING_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Location / name" required>
          <input name="location" required placeholder="Hotel name / restaurant" className="form-input" />
        </FormField>
        <FormField label="Provider">
          <input name="provider" placeholder="VietJet / Agoda / OpenTable" className="form-input" />
        </FormField>
        <FormField label="Start date/time">
          <input type="datetime-local" name="start" className="form-input" />
        </FormField>
        <FormField label="End date/time">
          <input type="datetime-local" name="end" className="form-input" />
        </FormField>
        <FormField label="Confirmation code">
          <input name="code" placeholder="ABC123" className="form-input" />
        </FormField>
        <FormField label="Cost">
          <input type="number" name="cost" step="0.01" min="0" placeholder="0.00" className="form-input" />
        </FormField>
        <FormField label="Currency">
          <select name="currency" defaultValue="USD" className="form-input">
            <option value="USD">USD</option>
            <option value="VND">VND</option>
            <option value="EUR">EUR</option>
          </select>
        </FormField>
      </div>
      <FormField label="Notes">
        <textarea name="notes" rows={2} placeholder="Seat 14A, vegetarian menu..." className="form-input" />
      </FormField>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="h-9 px-3 text-sm rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper">
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center gap-1 h-9 px-4 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover">
          Save booking
        </button>
      </div>
    </form>
  )
}

function ExpenseForm({ onSubmit, onCancel, currency }: { onSubmit: (form: FormData) => void; onCancel: () => void; currency: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
      className="border border-border rounded-sm bg-surface p-4 mb-4 space-y-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FormField label="Category" required>
          <select name="category" required className="form-input">
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Amount" required>
          <input type="number" name="amount" required step="0.01" min="0" placeholder="0.00" className="form-input" />
        </FormField>
        <FormField label="Currency">
          <select name="currency" defaultValue={currency} className="form-input">
            <option value="USD">USD</option>
            <option value="VND">VND</option>
            <option value="EUR">EUR</option>
          </select>
        </FormField>
        <FormField label="Spent on">
          <input type="date" name="spent_at" className="form-input" />
        </FormField>
      </div>
      <FormField label="Description">
        <input name="description" placeholder="Lunch at Cồn Market, taxi to airport…" className="form-input" />
      </FormField>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="h-9 px-3 text-sm rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper">
          Cancel
        </button>
        <button type="submit" className="inline-flex items-center gap-1 h-9 px-4 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover">
          Add expense
        </button>
      </div>
    </form>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">
        {label} {required ? <span className="text-danger">*</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: 'primary' | 'info' | 'success' | 'danger' | 'muted' }) {
  const colorClass = {
    primary: 'border-primary text-primary',
    info: 'border-info text-info',
    success: 'border-success text-success',
    danger: 'border-danger text-danger',
    muted: 'border-border text-muted',
  }[color]
  return (
    <div className={`border-l-4 pl-3 py-2 bg-surface border border-border ${colorClass.split(' ')[0]}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`text-lg font-semibold ${colorClass.split(' ')[1]}`}>{value}</p>
      <p className="text-[11px] text-subtle">{sub}</p>
    </div>
  )
}
