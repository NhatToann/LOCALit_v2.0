'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  User,
  Star,
  Compass,
  Settings,
  Save,
  Trash2,
  Check,
  AlertTriangle,
  Briefcase,
  Copy,
  Eye,
  Camera,
  Upload,
  X,
  Map as MapIcon,
} from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import { Avatar } from '@/components/ui/Avatar'
import { SPECIALTIES, SPECIALTY_LABELS, FAVORITE_PLACES, PLACE_LABELS, labelFor } from '@/lib/specialties'
import { TRANSPORT_LIST, TRANSPORT_LABEL, isTransport, type Transport } from '@/lib/transport'

const LANGS = [
  'English',
  'Vietnamese',
  'Japanese',
  'Korean',
  'French',
  'Mandarin',
  'Russian',
  'Spanish',
]
const SPECIALTY_LIST = SPECIALTIES.map((s) => SPECIALTY_LABELS[s])
const PLACE_LIST = FAVORITE_PLACES.map((p) => PLACE_LABELS[p])
const PLACE_SLUGS = FAVORITE_PLACES

type Tab = 'profile' | 'reviews' | 'specialties' | 'favorites' | 'account'

const PHONE_REGEX = /^[+]?[\d\s\-()]{8,20}$/

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'specialties', label: 'Specialties & languages', icon: Compass },
  { id: 'favorites', label: 'Favorite places', icon: MapIcon },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'account', label: 'Account', icon: Settings },
]

interface BuddyData {
  id: string
  location_city: string
  latitude: number | null
  longitude: number | null
  languages: string[]
  specialties: string[]
  favorite_places: string[]
  hourly_rate: number
  bio: string | null
  is_available: boolean
  trips_completed: number
  rating_avg: number | null
  transport: Transport | null
  transport_note: string | null
  profile: {
    full_name: string
    email: string
    avatar_url: string | null
    phone: string | null
    bio: string | null
  }
}

export default function BuddyProfileEditPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [buddy, setBuddy] = useState<BuddyData | null>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const supabase = createClient()
      const user = await getCurrentUser()
      if (!user) return

      const [{ data: b }, { data: r }] = await Promise.all([
        supabase
          .from('buddies')
          .select('*, profile:profiles(full_name, email, avatar_url, phone, bio)')
          .eq('id', user.id)
          .maybeSingle<BuddyData>(),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer:profiles!reviewer_id(full_name)')
          .eq('reviewee_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      if (b) {
        setBuddy({
          ...b,
          hourly_rate: b.hourly_rate || 15,
          favorite_places: b.favorite_places || [],
          transport: isTransport(b.transport) ? b.transport : null,
          transport_note: b.transport_note ?? null,
        })
      }
      setReviews(
        (r ?? []).map((row: any) => ({
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          created_at: row.created_at,
          reviewer_name: row.reviewer?.full_name ?? 'Traveler',
        })),
      )
    } catch (err) {
      console.error('Buddy profile load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleLanguage(l: string) {
    if (!buddy) return
    setBuddy({
      ...buddy,
      languages: buddy.languages.includes(l)
        ? buddy.languages.filter((x) => x !== l)
        : [...buddy.languages, l],
    })
  }
  function toggleSpecialty(s: string) {
    if (!buddy) return
    // Map display label → slug before saving.
    const slug = (Object.entries(SPECIALTY_LABELS).find(([, v]) => v === s)?.[0] ?? s) as string
    setBuddy({
      ...buddy,
      specialties: buddy.specialties.includes(slug)
        ? buddy.specialties.filter((x) => x !== slug)
        : [...buddy.specialties, slug],
    })
  }
  function toggleFavorite(label: string) {
    if (!buddy) return
    const slug = PLACE_SLUGS.find((p) => PLACE_LABELS[p] === label) ?? label
    setBuddy({
      ...buddy,
      favorite_places: buddy.favorite_places.includes(slug)
        ? buddy.favorite_places.filter((x) => x !== slug)
        : [...buddy.favorite_places, slug],
    })
  }

  async function handleSave() {
    if (!buddy) return
    setError('')

    if (buddy.profile.full_name.trim().length < 2) {
      setError('Full name must be at least 2 characters.')
      return
    }
    if (buddy.profile.phone && !PHONE_REGEX.test(buddy.profile.phone)) {
      setError('Please enter a valid phone number.')
      return
    }
    if (buddy.languages.length === 0) {
      setError('Please select at least one language.')
      return
    }
    if (buddy.specialties.length === 0) {
      setError('Please select at least one specialty.')
      return
    }
    if (buddy.hourly_rate < 0 || buddy.hourly_rate > 500) {
      setError('Hourly rate must be between 0 and 500.')
      return
    }
    if (buddy.bio && buddy.bio.length > 500) {
      setError('Bio must be 500 characters or fewer.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: pErr } = await supabase
      .from('profiles')
      .update({
        full_name: buddy.profile.full_name.trim(),
        phone: buddy.profile.phone || null,
      })
      .eq('id', buddy.id)
    if (pErr) {
      setError(pErr.message)
      setSaving(false)
      return
    }
    const { error: bErr } = await supabase
      .from('buddies')
      .update({
        location_city: 'Da Nang',
        hourly_rate: buddy.hourly_rate,
        bio: buddy.bio || null,
        languages: buddy.languages,
        specialties: buddy.specialties,
        favorite_places: buddy.favorite_places || [],
        is_available: buddy.is_available,
        transport: (buddy.transport ?? null) as Transport | null,
        transport_note: buddy.transport_note ?? null,
      })
      .eq('id', buddy.id)
    setSaving(false)
    if (bErr) {
      setError(bErr.message)
      return
    }
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(null), 3000)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !buddy) return
    setAvatarError('')
    // Basic validation
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setAvatarError('Use PNG, JPG, or WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Max size is 5 MB.')
      return
    }
    setAvatarUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${buddy.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setAvatarError(upErr.message)
      setAvatarUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = pub.publicUrl
    const { error: upProfileErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', buddy.id)
    setAvatarUploading(false)
    if (upProfileErr) {
      setAvatarError(upProfileErr.message)
      return
    }
    setBuddy({ ...buddy, profile: { ...buddy.profile, avatar_url: publicUrl } })
  }

  async function handleRemoveAvatar() {
    if (!buddy || !buddy.profile.avatar_url) return
    if (!confirm('Remove your custom avatar?')) return
    const supabase = createClient()
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', buddy.id)
    setBuddy({ ...buddy, profile: { ...buddy.profile, avatar_url: null } })
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPwMsg(null)
    const form = e.currentTarget
    const oldPw = (form.elements.namedItem('old') as HTMLInputElement).value
    const newPw = (form.elements.namedItem('new') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (!oldPw || !newPw || !confirm) {
      setPwMsg({ type: 'error', text: 'Please fill in all fields.' })
      return
    }
    if (newPw !== confirm) {
      setPwMsg({ type: 'error', text: 'The new password and confirmation do not match.' })
      return
    }
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      setPwMsg({
        type: 'error',
        text: 'New password must be at least 8 characters and include letters and numbers.',
      })
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setPwMsg({ type: 'error', text: 'Account email not found.' })
      setPwSaving(false)
      return
    }
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPw,
    })
    if (reauthErr) {
      setPwMsg({ type: 'error', text: 'Current password is incorrect.' })
      setPwSaving(false)
      return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (updateErr) {
      setPwMsg({ type: 'error', text: 'Password update failed: ' + updateErr.message })
      return
    }
    setPwMsg({ type: 'success', text: 'Password updated successfully.' })
    form.reset()
  }

  async function handleDeleteAccount() {
    if (
      !confirm(
        'Deleting your account will permanently remove your profile, requests and reviews. Continue?',
      )
    )
      return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id)
    if (delErr) {
      alert('Could not delete: ' + delErr.message)
      return
    }
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function copyPublicLink() {
    if (!buddy) return
    const url = `${window.location.origin}/buddy/${buddy.id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading || !buddy) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const firstName = buddy.profile.full_name.split(' ')[0]
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/buddy/${buddy.id}`

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">Account</p>
        <h1 className="text-page-title">Buddy profile</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="border border-border rounded-sm bg-surface p-5 h-fit">
          <div className="flex flex-col items-center text-center pb-5 border-b border-border">
            <div className="relative group">
              <Avatar name={buddy.profile.full_name} src={buddy.profile.avatar_url} size="xl" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Upload a new photo"
                className="absolute inset-0 inline-flex items-center justify-center bg-ink/60 text-paper rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150"
              >
                <Camera size={20} aria-hidden="true" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
                aria-hidden="true"
              />
            </div>
            {avatarUploading ? (
              <p className="text-xs text-muted mt-2 inline-flex items-center gap-1">
                <span className="loading-spinner w-3 h-3" aria-hidden="true" />
                Uploading…
              </p>
            ) : null}
            {avatarError ? (
              <p className="text-xs text-danger mt-2">{avatarError}</p>
            ) : null}
            <p className="mt-3 text-base font-semibold text-ink">{buddy.profile.full_name}</p>
            <span className="badge badge-primary text-xs mt-1">Local buddy</span>
            <p className="text-xs text-muted mt-1">{buddy.location_city}</p>
            <div className="mt-3 flex items-center gap-1">
              <span
                className={`badge ${buddy.is_available ? 'badge-success' : 'badge-neutral'} text-xs`}
              >
                {buddy.is_available ? 'Accepting travelers' : 'Hidden'}
              </span>
              {buddy.profile.avatar_url ? (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-muted hover:bg-paper hover:text-danger"
                  aria-label="Remove avatar"
                  title="Remove avatar"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <Link
            href="/buddy/dashboard"
            className="block mt-4 text-sm text-muted hover:text-ink"
          >
            ← Back to dashboard
          </Link>

          <nav
            className="mt-4 flex flex-col"
            role="tablist"
            aria-label="Buddy profile sections"
          >
            {TABS.map((t) => {
              const Icon = t.icon
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 h-10 px-3 text-sm font-medium border-l-2 -ml-px transition-colors duration-150 ${
                    active
                      ? 'text-primary border-primary bg-paper'
                      : 'text-muted border-transparent hover:text-ink'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {t.label}
                </button>
              )
            })}
          </nav>

          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-eyebrow text-muted mb-2">Public preview</p>
            <Link
              href={`/buddy/${buddy.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Eye size={12} aria-hidden="true" />
              View your public page
            </Link>
            <div className="mt-2 flex items-center gap-1">
              <code className="text-xs bg-paper border border-border rounded-sm px-2 py-1 truncate flex-1">
                {publicUrl}
              </code>
              <button
                type="button"
                onClick={copyPublicLink}
                aria-label="Copy public link"
                className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-border bg-surface hover:bg-paper"
              >
                <Copy size={12} aria-hidden="true" />
              </button>
            </div>
            {copied ? (
              <p className="text-xs text-success mt-1">Copied</p>
            ) : null}
          </div>

          <dl className="mt-5 pt-5 border-t border-border text-sm space-y-2">
            <div className="flex items-center justify-between">
              <dt className="text-muted flex items-center gap-1">
                <Star size={12} aria-hidden="true" />
                Average rating
              </dt>
              <dd className="font-semibold text-ink">
                {buddy.rating_avg ? buddy.rating_avg.toFixed(1) : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted flex items-center gap-1">
                <Briefcase size={12} aria-hidden="true" />
                Trips completed
              </dt>
              <dd className="font-semibold text-ink">{buddy.trips_completed}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Hourly rate</dt>
              <dd className="font-semibold text-ink">${buddy.hourly_rate}</dd>
            </div>
          </dl>
        </aside>

        {/* Main column */}
        <main className="border border-border rounded-sm bg-surface p-6">
          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {activeTab === 'profile' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Buddy information</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Save size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>

              {savedAt ? (
                <div className="alert alert-success mb-4" role="status">
                  <Check size={16} aria-hidden="true" />
                  <span>Saved successfully.</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="fullName" className="form-label">
                    Full name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-input"
                    value={buddy.profile.full_name}
                    onChange={(e) =>
                      setBuddy({
                        ...buddy,
                        profile: { ...buddy.profile, full_name: e.target.value },
                      })
                    }
                    maxLength={100}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone" className="form-label">Phone number</label>
                  <input
                    id="phone"
                    type="tel"
                    className="form-input"
                    value={buddy.profile.phone || ''}
                    onChange={(e) =>
                      setBuddy({
                        ...buddy,
                        profile: { ...buddy.profile, phone: e.target.value },
                      })
                    }
                    maxLength={20}
                    placeholder="+84..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="city" className="form-label">City</label>
                  <input
                    id="city"
                    type="text"
                    className="form-input bg-paper"
                    value="Da Nang"
                    readOnly
                  />
                  <p className="form-hint">
                    LOCALit currently only features Da Nang-based buddies.
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="rate" className="form-label">Hourly rate (USD)</label>
                  <input
                    id="rate"
                    type="number"
                    className="form-input"
                    value={buddy.hourly_rate}
                    onChange={(e) =>
                      setBuddy({ ...buddy, hourly_rate: parseFloat(e.target.value) || 0 })
                    }
                    min={0}
                    max={500}
                    step={0.5}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="bio" className="form-label">About me</label>
                <textarea
                  id="bio"
                  className="form-input form-textarea"
                  value={buddy.bio || ''}
                  onChange={(e) => setBuddy({ ...buddy, bio: e.target.value })}
                  rows={4}
                  maxLength={500}
                  placeholder="Tell travelers about yourself and what you can show them in Da Nang..."
                />
                <p className="form-hint">{(buddy.bio ?? '').length}/500 characters</p>
              </div>

              <div className="form-group">
                <label htmlFor="availability" className="form-label">Availability</label>
                <select
                  id="availability"
                  className="form-input form-select"
                  value={buddy.is_available ? 'true' : 'false'}
                  onChange={(e) =>
                    setBuddy({ ...buddy, is_available: e.target.value === 'true' })
                  }
                >
                  <option value="true">Accepting new travelers</option>
                  <option value="false">Hidden from search</option>
                </select>
                <p className="form-hint">
                  Hidden buddies do not appear in traveler search results.
                </p>
              </div>
            </section>
          ) : null}

          {activeTab === 'specialties' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Specialties & languages</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Save size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>

              <fieldset className="form-group">
                <legend className="form-label">Languages you speak</legend>
                <div className="flex flex-wrap gap-2">
                  {LANGS.map((l) => {
                    const active = buddy.languages.includes(l)
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggleLanguage(l)}
                        className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">Specialties</legend>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTY_LIST.map((s) => {
                    const active = buddy.specialties.some(
                      (slug) => SPECIALTY_LABELS[slug as keyof typeof SPECIALTY_LABELS] === s,
                    )
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSpecialty(s)}
                        className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">How you get around</legend>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-4">
                  <select
                    id="transport"
                    aria-label="Default mode of transport"
                    className="form-input form-select"
                    value={buddy.transport ?? ''}
                    onChange={(e) =>
                      setBuddy({
                        ...buddy,
                        transport: e.target.value === '' ? null : (e.target.value as Transport),
                      })
                    }
                  >
                    <option value="">No default</option>
                    {TRANSPORT_LIST.map((t) => (
                      <option key={t} value={t}>
                        {TRANSPORT_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    id="transport_note"
                    aria-label="Transport note"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 110cc manual scooter, plate 43-B1"
                    value={buddy.transport_note ?? ''}
                    onChange={(e) =>
                      setBuddy({ ...buddy, transport_note: e.target.value })
                    }
                    maxLength={120}
                  />
                </div>
                <p className="form-hint">
                  Per-stop transport on each itinerary overrides this default.
                </p>
              </fieldset>
            </section>
          ) : null}

          {activeTab === 'favorites' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div>
                  <h2 className="text-section-title">Favorite places in Da Nang</h2>
                  <p className="text-sm text-muted mt-1">
                    {buddy.favorite_places.length}/15 selected. Pin 3+ to stand out in traveler search.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Save size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>
              {savedAt ? (
                <div className="alert alert-success mb-4" role="status">
                  <Check size={16} aria-hidden="true" />
                  <span>Saved successfully.</span>
                </div>
              ) : null}
              <fieldset className="form-group">
                <legend className="form-label">Where do you take travelers?</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {PLACE_LIST.map((label) => {
                    const slug = PLACE_SLUGS.find((p) => PLACE_LABELS[p] === label)
                    const active = slug ? buddy.favorite_places.includes(slug) : false
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleFavorite(label)}
                        className={`text-left px-3 py-2 text-sm rounded-sm border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-paper text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        <MapIcon size={12} className="inline mr-2 align-middle" aria-hidden="true" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <p className="text-xs text-muted mt-3">
                These show on your public profile and feed the buddy map discovery.
              </p>
            </section>
          ) : null}

          {activeTab === 'reviews' ? (
            <section>
              <header className="mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">
                  Reviews from travelers <span className="text-muted">({reviews.length})</span>
                </h2>
              </header>

              {reviews.length === 0 ? (
                <div className="border border-border rounded-sm p-8 bg-paper text-center">
                  <p className="text-sm text-muted">
                    Complete your first trip to start collecting reviews from travelers.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-sm">
                  {reviews.map((r) => (
                    <li key={r.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.reviewer_name} size="sm" />
                          <p className="text-sm font-medium text-ink">{r.reviewer_name}</p>
                        </div>
                        <p className="text-xs text-muted">
                          {new Date(r.created_at).toLocaleDateString('en-US')}
                        </p>
                      </div>
                      <div className="flex gap-1 mb-2" aria-label={`Rated ${r.rating} out of 5`}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={14}
                            fill={s <= r.rating ? 'currentColor' : 'none'}
                            className={s <= r.rating ? 'text-warning' : 'text-border-strong'}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      {r.comment ? (
                        <p className="text-sm text-ink leading-relaxed">{r.comment}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {activeTab === 'account' ? (
            <section>
              <header className="mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Account</h2>
              </header>

              <section className="mb-6">
                <h3 className="text-sm font-semibold text-ink mb-3">Change password</h3>
                <form onSubmit={handleChangePassword}>
                  <div className="form-group">
                    <label htmlFor="old-pw" className="form-label">Current password</label>
                    <input
                      id="old-pw"
                      type="password"
                      name="old"
                      autoComplete="current-password"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="new-pw" className="form-label">New password</label>
                    <input
                      id="new-pw"
                      type="password"
                      name="new"
                      autoComplete="new-password"
                      maxLength={128}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirm-pw" className="form-label">Confirm new password</label>
                    <input
                      id="confirm-pw"
                      type="password"
                      name="confirm"
                      autoComplete="new-password"
                      maxLength={128}
                      className="form-input"
                    />
                  </div>
                  {pwMsg ? (
                    <div
                      className={`alert ${pwMsg.type === 'success' ? 'alert-success' : 'alert-error'} mb-3`}
                      role="status"
                    >
                      {pwMsg.type === 'success' ? (
                        <Check size={16} aria-hidden="true" />
                      ) : (
                        <AlertTriangle size={16} aria-hidden="true" />
                      )}
                      <span>{pwMsg.text}</span>
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pwSaving ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              </section>

              <section className="border-t border-border pt-6">
                <h3 className="text-sm font-semibold text-danger mb-2">Delete account</h3>
                <p className="text-sm text-muted mb-4 max-w-prose">
                  This permanently removes your profile, requests, and reviews. There is no undo.
                </p>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-danger border border-danger hover:bg-danger hover:text-paper"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete account
                </button>
              </section>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}
