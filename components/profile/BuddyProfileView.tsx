'use client'

/**
 * BuddyProfileView — full profile editor for the buddy role.
 *
 * Created 2026-10-01 to fix the role-dispatch bug in
 * app/profile/page.tsx (the original TouristProfilePage was mounted
 * for buddy users too, leaving the form empty because buddies have
 * a row in `public.buddies`, not `public.tourists`).
 *
 * Mirror of the TouristProfileView — same tab structure, same
 * completeness-score UX, same avatar upload / password change /
 * account delete plumbing. Where the tourist edits nationality +
 * travel style + interests + budget, the buddy edits location_city
 * + languages + specialties + hourly_rate + favorite_places +
 * bio.
 *
 * Data:
 *   - profiles (id, full_name, email, phone, avatar_url, bio)
 *   - buddies  (location_city, languages[], specialties[],
 *               hourly_rate, is_available, favorite_places[])
 *   - reviews by/of me (same table as tourist)
 *   - trips_completed is read-only (incremented by the accept-trip
 *     flow, never by hand)
 *
 * WHY TYPED AGAINST Buddy + Profile from lib/types.ts:
 *   The TouristProfileView imports `Tourist` and casts its fields
 *   liberally. We do the same here for the buddy fields. If the
 *   schema ever drifts, run `npx tsc --noEmit` and the broken
 *   sites light up.
 */

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User,
  Globe,
  MapPin,
  Star,
  Briefcase,
  Save as SaveIcon,
  Trash2,
  Check as CheckIcon,
  AlertTriangle,
  Camera,
  X,
  DollarSign,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Profile, Buddy } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

const LANGUAGES = [
  'English',
  'Vietnamese',
  'Japanese',
  'Korean',
  'French',
  'Mandarin',
  'Russian',
  'Spanish',
  'German',
]

const SPECIALTIES = [
  'Food tours',
  'Photography',
  'Hiking',
  'Motorbike tours',
  'History',
  'Night markets',
  'Local crafts',
  'Beach',
  'Surfing',
  'Coffee culture',
  'Pagodas',
  'Family-friendly',
  'Solo travelers',
  'Luxury',
  'Backpacker',
]

const FAVORITE_PLACES = [
  'Marble Mountains',
  'Son Tra Peninsula',
  'My Khe Beach',
  'Han River',
  'Ba Na Hills',
  'Hoi An Old Town',
  'Dragon Bridge',
  'Son Tra Night Market',
  'Lin Ung Pagoda',
  'My Son Sanctuary',
  'Lady Buddha',
]

type Tab = 'personal' | 'expertise' | 'reviews' | 'account'

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'personal', label: 'Personal info', icon: User },
  { id: 'expertise', label: 'Expertise & pricing', icon: Briefcase },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'account', label: 'Account', icon: Globe },
]

const PHONE_REGEX = /^[+]?[\d\s\-()]{8,20}$/

/**
 * Shared "Switch account role" widget, used by both Buddy and Tourist
 * profile views. Posts to /api/profile/switch-role and reloads the
 * page so the dispatcher re-renders the new role's view.
 */
function SwitchRoleSection({
  currentRole,
  fullName,
}: {
  currentRole: 'tourist' | 'buddy'
  fullName: string
}) {
  const router = useRouter()
  const [target, setTarget] = useState<'tourist' | 'buddy'>(currentRole)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const sameRole = target === currentRole

  async function handleSwitch() {
    if (sameRole || busy) return
    if (
      !confirm(
        `Switch your account role to ${target === 'buddy' ? 'Buddy' : 'Tourist'}? Your current ${currentRole} data stays in the database but the ${target === 'buddy' ? 'tourist' : 'buddy'} view will become primary.`,
      )
    )
      return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profile/switch-role', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: target }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !json.ok) {
        setMsg({ type: 'error', text: json.error ?? 'Could not switch role.' })
        setBusy(false)
        return
      }
      setMsg({ type: 'success', text: `Switched to ${target}. Reloading…` })
      router.replace('/profile')
      router.refresh()
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload()
      }, 400)
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Network error.' })
      setBusy(false)
    }
  }

  return (
    <section className="mb-6 border border-border rounded-sm p-4 bg-paper">
      <h3 className="text-sm font-semibold text-ink mb-1">Switch account role</h3>
      <p className="text-xs text-muted mb-3 max-w-prose">
        {fullName}, your account is currently a{' '}
        <span className="badge badge-info text-xs">
          {currentRole === 'buddy' ? 'Buddy' : 'Tourist'}
        </span>
        . Switching role changes which dashboard, browse, and profile view you see. Your previous
        role&apos;s data is preserved but hidden until you switch back.
      </p>
      <fieldset className="form-group mb-3">
        <legend className="sr-only">Choose new account role</legend>
        <div className="flex flex-wrap gap-2">
          {(['tourist', 'buddy'] as const).map((r) => {
            const active = target === r
            const isCurrent = currentRole === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setTarget(r)}
                aria-pressed={active}
                className={`h-9 px-3 text-sm font-medium rounded-sm border transition-colors duration-150 ${
                  active
                    ? 'bg-primary text-paper border-primary'
                    : 'bg-transparent text-ink border-border-strong hover:bg-surface'
                }`}
              >
                {r === 'tourist' ? 'Tourist' : 'Buddy'}
                {isCurrent ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide font-mono text-muted">
                    Current
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </fieldset>
      <button
        type="button"
        onClick={handleSwitch}
        disabled={busy || sameRole}
        className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
      >
        {busy ? 'Switching…' : 'Switch role'}
      </button>
      {msg ? (
        <p
          className={`mt-2 text-xs ${msg.type === 'success' ? 'text-success' : 'text-danger'}`}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  )
}

export default function BuddyProfileView() {
  const [activeTab, setActiveTab] = useState<Tab>('personal')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [buddy, setBuddy] = useState<Buddy | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [reviewsWritten, setReviewsWritten] = useState<any[]>([])
  const [reviewsAboutMe, setReviewsAboutMe] = useState<any[]>([])
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser()
        if (!user) return
        const supabase = createClient()
        const [
          { data: p },
          { data: b },
          { data: reviewsToMe },
          { data: reviewsByMe },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase.from('buddies').select('*').eq('id', user.id).maybeSingle<Buddy>(),
          supabase
            .from('reviews')
            .select('id, rating, comment, created_at, reviewer:reviewer_id(full_name)')
            .eq('reviewee_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('reviews')
            .select('id, rating, comment, created_at, reviewee:reviewee_id(full_name)')
            .eq('reviewer_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ])
        setProfile(p)
        setBuddy(b)
        setReviewsAboutMe(reviewsToMe ?? [])
        setReviewsWritten(reviewsByMe ?? [])
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Buddy profile load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // --- Buddy-array toggles ------------------------------------------

  function toggleLanguage(l: string) {
    if (!buddy) return
    const exists = buddy.languages.includes(l)
    setBuddy({
      ...buddy,
      languages: exists ? buddy.languages.filter((x) => x !== l) : [...buddy.languages, l],
    })
  }

  function toggleSpecialty(s: string) {
    if (!buddy) return
    const exists = buddy.specialties.includes(s)
    setBuddy({
      ...buddy,
      specialties: exists
        ? buddy.specialties.filter((x) => x !== s)
        : [...buddy.specialties, s],
    })
  }

  function toggleFavoritePlace(p: string) {
    if (!buddy) return
    const exists = buddy.favorite_places.includes(p)
    setBuddy({
      ...buddy,
      favorite_places: exists
        ? buddy.favorite_places.filter((x) => x !== p)
        : [...buddy.favorite_places, p],
    })
  }

  // --- Save ---------------------------------------------------------

  async function handleSave() {
    if (!profile || !buddy) return
    setError('')

    if (profile.full_name.trim().length < 2) {
      setError('Full name must be at least 2 characters.')
      return
    }
    if (profile.phone && !PHONE_REGEX.test(profile.phone)) {
      setError('Please enter a valid phone number.')
      return
    }
    if (profile.bio && profile.bio.length > 500) {
      setError('Bio must be 500 characters or fewer.')
      return
    }
    if (!buddy.location_city.trim()) {
      setError('Please enter the city where you operate (we default to Da Nang).')
      return
    }
    if (buddy.languages.length === 0) {
      setError('Pick at least one language you can guide in.')
      return
    }
    if (buddy.specialties.length === 0) {
      setError('Pick at least one specialty so tourists know what you offer.')
      return
    }
    if (buddy.hourly_rate <= 0) {
      setError('Hourly rate must be greater than 0.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: pErr } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name.trim(),
        phone: profile.phone || null,
        bio: profile.bio || null,
      })
      .eq('id', profile.id)
    if (pErr) {
      setError(pErr.message)
      setSaving(false)
      return
    }
    const { error: bErr } = await supabase
      .from('buddies')
      .update({
        location_city: buddy.location_city.trim(),
        languages: buddy.languages,
        specialties: buddy.specialties,
        hourly_rate: buddy.hourly_rate,
        is_available: buddy.is_available,
        favorite_places: buddy.favorite_places,
        bio: buddy.bio ?? null,
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

  // --- Avatar --------------------------------------------------------

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setAvatarError('')
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
    const path = `${profile.id}/${Date.now()}.${ext}`
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
      .eq('id', profile.id)
    setAvatarUploading(false)
    if (upProfileErr) {
      setAvatarError(upProfileErr.message)
      return
    }
    setProfile({ ...profile, avatar_url: publicUrl })
  }

  async function handleRemoveAvatar() {
    if (!profile || !profile.avatar_url) return
    if (!confirm('Remove your custom avatar?')) return
    const supabase = createClient()
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setProfile({ ...profile, avatar_url: null })
  }

  // --- Password / delete (identical plumbing to tourist view) --------

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
    if (newPw.length < 10 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      setPwMsg({
        type: 'error',
        text: 'New password must be at least 10 characters and include letters and numbers.',
      })
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: profile?.email ?? '',
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
        'Deleting your account will permanently remove your profile, conversations, messages and reviews. Continue?',
      )
    )
      return
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id)
    if (delErr) {
      alert('Could not delete: ' + delErr.message)
      return
    }
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  // --- Loading + missing-data handling ------------------------------

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (!profile || !buddy) {
    return (
      <div className="container-page py-16">
        <p className="text-muted">Buddy profile not found.</p>
      </div>
    )
  }

  // --- Completeness score (buddy-specific fields) ------------------

  const fields: { filled: boolean; hint: string }[] = [
    { filled: !!profile.avatar_url, hint: 'avatar' },
    { filled: profile.full_name.trim().length >= 2, hint: 'name' },
    { filled: !!profile.phone, hint: 'phone' },
    { filled: !!buddy.location_city, hint: 'city' },
    { filled: !!(profile.bio && profile.bio.length >= 30), hint: 'bio (30+ chars)' },
    { filled: buddy.languages.length >= 1, hint: '1+ language' },
    { filled: buddy.specialties.length >= 3, hint: '3+ specialties' },
    { filled: buddy.hourly_rate > 0, hint: 'hourly rate' },
    { filled: buddy.favorite_places.length >= 1, hint: '1+ favorite place' },
  ]
  const filledCount = fields.filter((f) => f.filled).length
  const completenessPct = Math.round((filledCount / fields.length) * 100)
  const missingHints = fields.filter((f) => !f.filled).map((f) => f.hint)

  // --- JSX ---------------------------------------------------------

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">Account</p>
        <h1 className="text-page-title">My buddy profile</h1>
        <p className="text-sm text-muted mt-1 max-w-prose">
          Tourists see this when deciding whether to send you a request. Aim for 80% or higher.
        </p>
        <div className="mt-3 max-w-md">
          <div className="flex items-center justify-between text-xs mb-1" aria-live="polite">
            <span className="text-muted">Profile completeness</span>
            <strong
              className={
                completenessPct >= 80
                  ? 'text-success'
                  : completenessPct >= 50
                    ? 'text-warning'
                    : 'text-danger'
              }
            >
              {completenessPct}%
            </strong>
          </div>
          <div className="h-2 bg-paper border border-border rounded-sm overflow-hidden">
            <div
              className={`h-full ${completenessPct >= 80 ? 'bg-success' : completenessPct >= 50 ? 'bg-warning' : 'bg-danger'}`}
              style={{ width: `${completenessPct}%` }}
              aria-hidden="true"
            />
          </div>
          {missingHints.length > 0 ? (
            <p className="text-xs text-muted mt-2">Missing: {missingHints.join(', ')}.</p>
          ) : (
            <p className="text-xs text-success mt-2">All set.</p>
          )}
      </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="border border-border rounded-sm bg-surface p-5 h-fit">
          <div className="flex flex-col items-center text-center pb-5 border-b border-border">
            <div className="relative group">
              <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" />
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
            <p className="mt-3 text-base font-semibold text-ink">{profile.full_name}</p>
            <span className="badge badge-info text-xs mt-1">Buddy</span>
            <p className="text-xs text-muted mt-1">{profile.email}</p>
            {profile.avatar_url ? (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="inline-flex items-center gap-1 mt-2 text-xs text-muted hover:text-danger"
                aria-label="Remove avatar"
              >
                <X size={12} aria-hidden="true" /> Remove photo
              </button>
            ) : null}
          </div>
          <Link
            href="/dashboard"
            className="block mt-4 text-sm text-muted hover:text-ink"
          >
            ← Back to dashboard
          </Link>
          <nav className="mt-4 flex flex-col" role="tablist" aria-label="Profile sections">
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
        </aside>

        {/* Main column */}
        <main className="border border-border rounded-sm bg-surface p-6">
          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {activeTab === 'personal' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Personal information</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <SaveIcon size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>

              {savedAt ? (
                <div className="alert alert-success mb-4" role="status">
                  <CheckIcon size={16} aria-hidden="true" />
                  <span>Saved successfully.</span>
                </div>
              ) : null}

              <div className="form-group">
                <label htmlFor="fullName" className="form-label">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  className="form-input"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  maxLength={100}
                  placeholder="Your full name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input bg-paper"
                  value={profile.email}
                  disabled
                />
                <p className="form-hint">Email cannot be changed.</p>
              </div>

              <div className="form-group">
                <label htmlFor="phone" className="form-label">Phone number</label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+84..."
                  maxLength={20}
                />
              </div>

              <div className="form-group">
                <label htmlFor="city" className="form-label">
                  <MapPin size={12} aria-hidden="true" className="inline mr-1" />
                  City you operate in
                </label>
                <input
                  id="city"
                  type="text"
                  className="form-input"
                  value={buddy.location_city}
                  onChange={(e) => setBuddy({ ...buddy, location_city: e.target.value })}
                  placeholder="Da Nang"
                  maxLength={100}
                />
                <p className="form-hint">LOCALit currently only lists buddies in Da Nang.</p>
              </div>

              {/* Availability toggle */}
              <fieldset className="form-group">
                <legend className="form-label">Availability</legend>
                <button
                  type="button"
                  onClick={() => setBuddy({ ...buddy, is_available: !buddy.is_available })}
                  aria-pressed={buddy.is_available}
                  className={`inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm border ${
                    buddy.is_available
                      ? 'bg-success text-paper border-success'
                      : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                  }`}
                >
                  {buddy.is_available ? (
                    <ToggleRight size={16} aria-hidden="true" />
                  ) : (
                    <ToggleLeft size={16} aria-hidden="true" />
                  )}
                  {buddy.is_available ? 'Accepting requests' : 'Not accepting requests'}
                </button>
                <p className="form-hint">
                  Tourists see your badge as a small green dot when this is on.
                </p>
              </fieldset>

              <div className="form-group">
                <label htmlFor="bio" className="form-label">About me</label>
                <textarea
                  id="bio"
                  className="form-input form-textarea"
                  value={profile.bio || ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={4}
                  maxLength={500}
                  placeholder="Tell tourists why you're the right buddy for Da Nang…"
                />
                <p className="form-hint">{(profile.bio ?? '').length}/500 characters</p>
              </div>
            </section>
          ) : null}

          {activeTab === 'expertise' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Expertise &amp; pricing</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <SaveIcon size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>

              {/* Hourly rate */}
              <fieldset className="form-group">
                <legend className="form-label">
                  <DollarSign size={12} aria-hidden="true" className="inline mr-1" />
                  Hourly rate (USD)
                </legend>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">$</span>
                  <input
                    type="number"
                    className="form-input w-32"
                    value={buddy.hourly_rate}
                    min={1}
                    max={500}
                    onChange={(e) =>
                      setBuddy({ ...buddy, hourly_rate: Number(e.target.value) || 0 })
                    }
                    aria-label="Hourly rate in USD"
                  />
                  <span className="text-sm text-muted">/ hour</span>
                </div>
                <p className="form-hint">
                  LOCALit's commission is 0%. You receive the full amount.
                </p>
              </fieldset>

              {/* Languages */}
              <fieldset className="form-group">
                <legend className="form-label">Languages you guide in</legend>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => {
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

              {/* Specialties */}
              <fieldset className="form-group">
                <legend className="form-label">Specialties</legend>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => {
                    const active = buddy.specialties.includes(s)
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

              {/* Favorite places */}
              <fieldset className="form-group">
                <legend className="form-label">Favorite places in Da Nang</legend>
                <div className="flex flex-wrap gap-2">
                  {FAVORITE_PLACES.map((p) => {
                    const active = buddy.favorite_places.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleFavoritePlace(p)}
                        className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <p className="form-hint">
                  Tourists see these on your map popup so they know what you're excited about.
                </p>
              </fieldset>

              <div className="form-group">
                <label htmlFor="buddyBio" className="form-label">Buddy-specific bio</label>
                <textarea
                  id="buddyBio"
                  className="form-input form-textarea"
                  value={buddy.bio ?? ''}
                  onChange={(e) => setBuddy({ ...buddy, bio: e.target.value })}
                  rows={4}
                  maxLength={500}
                  placeholder="Anything else tourists should know: transport, certifications, languages you speak at home, etc."
                />
                <p className="form-hint">{(buddy.bio ?? '').length}/500 characters</p>
              </div>

              <div className="border-t border-border pt-4 mt-2">
                <p className="text-xs text-muted">
                  Trips completed: <strong className="text-ink">{buddy.trips_completed}</strong>{' '}
                  · Average rating:{' '}
                  <strong className="text-ink">
                    {buddy.rating_avg ? buddy.rating_avg.toFixed(1) : '—'}
                  </strong>{' '}
                  / 5
                </p>
                <p className="text-xs text-subtle mt-1">
                  These are computed automatically from your completed trips and reviews — no
                  manual edits.
                </p>
              </div>
            </section>
          ) : null}

          {activeTab === 'reviews' ? (
            <section>
              <header className="mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Reviews</h2>
              </header>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-ink mb-3">Reviews you wrote</h3>
                {reviewsWritten.length === 0 ? (
                  <p className="text-sm text-muted">You haven&apos;t written any reviews yet.</p>
                ) : (
                  <ul className="divide-y divide-border border border-border rounded-sm">
                    {reviewsWritten.map((r: any) => (
                      <li key={r.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-ink">
                            Review for {r.reviewee?.full_name ?? 'Tourist'}
                          </p>
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
                        <p className="text-sm text-ink leading-relaxed">{r.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ink mb-3">Reviews about you</h3>
                {reviewsAboutMe.length === 0 ? (
                  <p className="text-sm text-muted">No reviews about you yet.</p>
                ) : (
                  <ul className="divide-y divide-border border border-border rounded-sm">
                    {reviewsAboutMe.map((r: any) => (
                      <li key={r.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={r.reviewer?.full_name ?? 'Anonymous'}
                              size="sm"
                            />
                            <p className="text-sm font-medium text-ink">
                              {r.reviewer?.full_name ?? 'Anonymous'}
                            </p>
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
                        <p className="text-sm text-ink leading-relaxed">{r.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'account' ? (
            <section>
              <header className="mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Account</h2>
              </header>

              <SwitchRoleSection
                currentRole="buddy"
                fullName={profile.full_name}
              />

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
                        <CheckIcon size={16} aria-hidden="true" />
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
                  This permanently removes your profile, conversations, messages, and reviews.
                  There is no undo.
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