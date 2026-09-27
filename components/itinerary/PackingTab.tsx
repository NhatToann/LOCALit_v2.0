'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripPackingItem, Profile } from '@/lib/types'
import { Plus, X, Trash2, Shirt, Bath, Laptop, FileText, Box, Check } from 'lucide-react'

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

const CATEGORIES: Array<{ id: TripPackingItem['category']; label: string; Icon: typeof Shirt }> = [
  { id: 'clothes', label: 'Clothes', Icon: Shirt },
  { id: 'toiletries', label: 'Toiletries', Icon: Bath },
  { id: 'tech', label: 'Tech', Icon: Laptop },
  { id: 'docs', label: 'Docs', Icon: FileText },
  { id: 'misc', label: 'Misc', Icon: Box },
]

const SUGGESTED: Record<TripPackingItem['category'], string[]> = {
  clothes: ['T-shirts', 'Shorts', 'Sunscreen shirt', 'Light rain jacket', 'Socks (5)', 'Underwear (5)', 'Sandals', 'Walking shoes', 'Hat / cap'],
  toiletries: ['Toothbrush + toothpaste', 'Shampoo (small)', 'Sunscreen SPF 50', 'Insect repellent', 'Deodorant', 'Razor'],
  tech: ['Phone charger', 'Power bank', 'Type-C / Lightning cable', 'Travel adapter (Vietnam type A/C)', 'Headphones', 'Camera + SD card'],
  docs: ['Passport', 'Visa (if needed)', 'Travel insurance', 'Hotel reservations printout', 'Driver license (motorbike)'],
  misc: ['Reusable water bottle', 'Day backpack', 'Snacks', 'Small lock for hostel', 'Wet wipes', 'First-aid basics'],
}

export default function PackingTab({ trip, canEdit, me, onLogActivity }: Props) {
  const [items, setItems] = useState<TripPackingItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [newCategory, setNewCategory] = useState<TripPackingItem['category']>('misc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [trip.id])

  useEffect(() => {
    if (!trip) return
    const supabase = createClient()
    const ch = supabase
      .channel(`packing-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_packing_items', filter: `trip_id=eq.${trip.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [trip.id])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('trip_packing_items')
      .select('*')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: true })
    setItems((data as TripPackingItem[]) || [])
    setLoading(false)
  }

  async function togglePacked(it: TripPackingItem) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase
      .from('trip_packing_items')
      .update({
        is_packed: !it.is_packed,
        packed_by: !it.is_packed ? me.id : null,
        packed_at: !it.is_packed ? new Date().toISOString() : null,
      })
      .eq('id', it.id)
    onLogActivity(!it.is_packed ? 'packed_item' : 'unpacked_item', { item: it.item })
    load()
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const text = newItem.trim()
    if (!text) return
    const supabase = createClient()
    await supabase.from('trip_packing_items').insert({
      trip_id: trip.id,
      item: text.slice(0, 100),
      category: newCategory,
    })
    onLogActivity('added_packing_item', { item: text, category: newCategory })
    setNewItem('')
    load()
  }

  async function addSuggested(category: TripPackingItem['category'], text: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_packing_items').insert({
      trip_id: trip.id,
      item: text,
      category,
    })
    load()
  }

  async function deleteItem(id: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_packing_items').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="loading-spinner mx-auto my-8" />

  const total = items.length
  const packed = items.filter((i) => i.is_packed).length
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Packing list</h2>
        <p className="text-sm text-muted mb-3">Check items off as you pack. Both can edit.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-paper border border-border rounded-sm overflow-hidden">
            <div className="h-full bg-success transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted whitespace-nowrap">
            {packed} / {total} packed ({pct}%)
          </span>
        </div>
      </header>

      {/* Add item */}
      {canEdit ? (
        <form onSubmit={addItem} className="flex items-center gap-2">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as TripPackingItem['category'])}
            className="form-input w-auto"
            aria-label="Category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add item…"
            maxLength={100}
            className="form-input flex-1"
            aria-label="New packing item"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 h-10 px-4 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Plus size={13} aria-hidden="true" /> Add
          </button>
        </form>
      ) : null}

      {/* Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORIES.map((cat) => {
          const catItems = items.filter((i) => i.category === cat.id)
          const suggested = SUGGESTED[cat.id].filter((s) => !catItems.some((it) => it.item.toLowerCase() === s.toLowerCase()))
          const Icon = cat.Icon
          return (
            <section key={cat.id} className="border border-border rounded-sm bg-paper overflow-hidden">
              <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface">
                <Icon size={13} className="text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold flex-1">{cat.label}</h3>
                <span className="text-[11px] text-muted">
                  {catItems.filter((i) => i.is_packed).length}/{catItems.length}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {catItems.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-muted italic">No items in this category yet.</li>
                ) : (
                  catItems.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-2 px-3 py-2 group hover:bg-surface transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => togglePacked(it)}
                        disabled={!canEdit}
                        aria-label={it.is_packed ? `Mark ${it.item} as unpacked` : `Mark ${it.item} as packed`}
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-sm border ${
                          it.is_packed
                            ? 'bg-success border-success text-paper'
                            : 'border-border-strong bg-paper'
                        } ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
                      >
                        {it.is_packed ? <Check size={11} aria-hidden="true" /> : null}
                      </button>
                      <span
                        className={`flex-1 text-sm ${
                          it.is_packed ? 'line-through text-muted' : 'text-ink'
                        }`}
                      >
                        {it.item}
                      </span>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => deleteItem(it.id)}
                          aria-label={`Delete ${it.item}`}
                          className="text-muted hover:text-danger opacity-0 group-hover:opacity-100"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                    </li>
                  ))
                )}
                {canEdit && suggested.length > 0 ? (
                  <li className="px-3 py-2 bg-paper">
                    <p className="text-[11px] uppercase tracking-wider text-subtle mb-1">Suggested</p>
                    <div className="flex flex-wrap gap-1">
                      {suggested.slice(0, 5).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addSuggested(cat.id, s)}
                          className="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded-sm bg-info-bg text-info border border-info-bg hover:opacity-80"
                        >
                          <Plus size={9} aria-hidden="true" /> {s}
                        </button>
                      ))}
                    </div>
                  </li>
                ) : null}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
