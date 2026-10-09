'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User,
  Globe,
  MapPin,
  Star,
  Heart,
  Settings,
  Save,
  Trash2,
  Check,
  AlertTriangle,
  Camera,
  X,
} from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Profile, Tourist } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import TravelHistory from '@/components/profile/TravelHistory'
import { useSafeTimeout } from '@/hooks/useSafeTimeout'

const INTERESTS = [
  'Beach',
  'Photography',
  'Food',
  'History',
  'Nature',
  'Nightlife',
  'Shopping',
  'Culture',
  'Adventure',
  'Wellness',
  'Sunset',
  'Architecture',
  'Local Life',
  'Water Sports',
]
const TRAVEL_STYLES = [
  { id: 'solo', label: 'Solo' },
  { id: 'couple', label: 'Couple' },
  { id: 'friends', label: 'With Friends' },
  { id: 'family', label: 'Family' },
]
const LANGUAGES = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian']
const BUDGETS = [
  { id: 'under-50', label: 'Under $50' },
  { id: '50-100', label: '$50-100' },
  { id: '100-200', label: '$100-200' },
  { id: '200+', label: '$200+' },
]
const NATIONALITIES = [
  'United States',
  'United Kingdom',
  'Australia',
  'Singapore',
  'Japan',
  'South Korea',
  'China',
  'Vietnam',
  'Other',
]

type Tab = 'personal' | 'preferences' | 'trips' | 'reviews' | 'account'

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

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'personal', label: 'Personal info', icon: User },
  { id: 'preferences', label: 'Travel preferences', icon: Globe },
  { id: 'trips', label: 'My itineraries', icon: MapPin },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'account', label: 'Account', icon: Settings },
]

export default function TouristProfileView() {
  const toastTimer = useSafeTimeout()
  const [activeTab, setActiveTab] = useState<Tab>('personal')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tourist, setTourist] = useState<Tourist | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [itineraries, setItineraries] = useState<any[]>([])
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
          { data: t },
          { data: bookings },
          { data: reviewsToMe },
          { data: reviewsByMe },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase.from('tourists').select('*').eq('id', user.id).maybeSingle<Tourist>(),
          supabase
            .from('itineraries')
            .select('id, title, status, start_date, destination')
            .eq('owner_id', user.id)
            .order('start_date', { ascending: false })
            .limit(20),
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
        setTourist(t)
        setItineraries(bookings ?? [])
        setReviewsAboutMe(reviewsToMe ?? [])
        setReviewsWritten(reviewsByMe ?? [])
      } catch (err) {
        console.error('Profile load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function toggleInterest(i: string) {
    if (!tourist) return
    const exists = tourist.interests.includes(i)
    setTourist({
      ...tourist,
      interests: exists
        ? tourist.interests.filter((x) => x !== i)
        : [...tourist.interests, i],
    })
  }
  function toggleLanguage(l: string) {
    if (!tourist) return
    const exists = tourist.languages.includes(l)
    setTourist({
      ...tourist,
      languages: exists
        ? tourist.languages.filter((x) => x !== l)
        : [...tourist.languages, l],
    })
  }

  async function handleSave() {
    if (!profile || !tourist) return
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
    const { error: tErr } = await supabase
      .from('tourists')
      .update({
        nationality: tourist.nationality || null,
        date_of_birth: tourist.date_of_birth || null,
        travel_style: tourist.travel_style || null,
        interests: tourist.interests,
        languages: tourist.languages,
        budget_range: tourist.budget_range,
        destination: tourist.destination || 'Da Nang',
      })
      .eq('id', tourist.id)
    setSaving(false)
    if (tErr) {
      setError(tErr.message)
      return
    }
    setSavedAt(Date.now())
    toastTimer.schedule(() => setSavedAt(null), 3000)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setAvatarError('')

    // Allow common image formats including iPhone HEIC photos.
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'image/heif',
    ]
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif']
    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      setAvatarError(`Unsupported file type. Use PNG, JPG, WebP, or HEIC. (got: ${file.type || 'unknown'})`)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError(`Max size is 10 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`)
      return
    }

    setAvatarUploading(true)
    try {
      const supabase = createClient()
      const safeExt = ext || 'jpg'
      const path = `${profile.id}/${Date.now()}.${safeExt}`
      const contentType =
        file.type ||
        (safeExt === 'png'
          ? 'image/png'
          : safeExt === 'webp'
            ? 'image/webp'
            : 'image/jpeg')

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType, cacheControl: '3600' })
      if (upErr) {
        // eslint-disable-next-line no-console
        console.error('[avatar] upload failed:', upErr)
        setAvatarError(`Upload failed: ${upErr.message}`)
        return
      }

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const { error: upProfileErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id)
      if (upProfileErr) {
        // eslint-disable-next-line no-console
        console.error('[avatar] profile update failed:', upProfileErr)
        setAvatarError(`Could not save: ${upProfileErr.message}`)
        return
      }
      setProfile({ ...profile, avatar_url: publicUrl })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[avatar] unexpected error:', err)
      setAvatarError(`Unexpected error: ${(err as Error).message}`)
    } finally {
      setAvatarUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    if (!profile || !profile.avatar_url) return
    if (!confirm('Remove your custom avatar?')) return
    const supabase = createClient()
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setProfile({ ...profile, avatar_url: null })
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
        'Deleting your account will permanently remove your profile, trips, messages and reviews. Continue?',
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

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (!profile || !tourist) {
    return (
      <div className="container-page py-16">
        <p className="text-muted">Profile not found.</p>
      </div>
    )
  }

  const firstName = profile.full_name.split(' ')[0]

  // Profile completeness score: how many slots are filled out of N total.
  const fields: { filled: boolean; hint: string }[] = [
    { filled: !!profile.avatar_url, hint: 'avatar' },
    { filled: profile.full_name.trim().length >= 2, hint: 'name' },
    { filled: !!profile.phone, hint: 'phone' },
    { filled: !!tourist.nationality, hint: 'nationality' },
    { filled: !!tourist.date_of_birth, hint: 'date of birth' },
    { filled: !!(profile.bio && profile.bio.length >= 30), hint: 'bio' },
    { filled: tourist.interests.length >= 3, hint: '3+ interests' },
    { filled: tourist.languages.length >= 1, hint: '1+ language' },
    { filled: !!tourist.budget_range, hint: 'budget' },
  ]
  const filledCount = fields.filter((f) => f.filled).length
  const completenessPct = Math.round((filledCount / fields.length) * 100)
  const missingHints = fields.filter((f) => !f.filled).map((f) => f.hint)

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">Account</p>
        <h1 className="text-page-title">My profile</h1>
        <p className="text-sm text-muted mt-1 max-w-prose">
          Buddies see this when deciding whether to accept your connection
          request. Aim for 80% or higher.
        </p>
        <div className="mt-3 max-w-md">
          <div
            className="flex items-center justify-between text-xs mb-1"
            aria-live="polite"
          >
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
            <p className="text-xs text-muted mt-2">
              Missing: {missingHints.join(', ')}.
            </p>
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
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
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
            <span className="badge badge-primary text-xs mt-1">Tourist</span>
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
                <label htmlFor="nationality" className="form-label">Nationality</label>
                <select
                  id="nationality"
                  className="form-input form-select"
                  value={tourist.nationality ?? ''}
                  onChange={(e) => setTourist({ ...tourist, nationality: e.target.value })}
                >
                  <option value="">-- Select --</option>
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="dob" className="form-label">Date of birth</label>
                <input
                  id="dob"
                  type="date"
                  className="form-input"
                  value={tourist.date_of_birth || ''}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setTourist({ ...tourist, date_of_birth: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bio" className="form-label">About me</label>
                <textarea
                  id="bio"
                  className="form-input form-textarea"
                  value={profile.bio || ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={4}
                  maxLength={500}
                  placeholder="Tell buddies about yourself and the trip you dream of..."
                />
                <p className="form-hint">{(profile.bio ?? '').length}/500 characters</p>
              </div>
            </section>
          ) : null}

          {activeTab === 'preferences' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Travel preferences</h2>
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

              <div className="form-group">
                <label htmlFor="destination" className="form-label">Main destination</label>
                <input
                  id="destination"
                  type="text"
                  className="form-input bg-paper"
                  value="Da Nang"
                  readOnly
                />
                <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
              </div>

              <fieldset className="form-group">
                <legend className="form-label">Travel style</legend>
                <div className="grid grid-cols-2 gap-2">
                  {TRAVEL_STYLES.map((s) => {
                    const active = tourist.travel_style === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTourist({ ...tourist, travel_style: s.id })}
                        className={`h-10 px-3 text-sm font-medium rounded-sm border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">Interests</legend>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => {
                    const active = tourist.interests.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleInterest(i)}
                        className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">Languages you speak</legend>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => {
                    const active = tourist.languages.includes(l)
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
                <legend className="form-label">Daily budget</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BUDGETS.map((b) => {
                    const active = tourist.budget_range === b.id
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setTourist({ ...tourist, budget_range: b.id })}
                        className={`h-10 px-3 text-sm font-medium rounded-sm border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {b.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </section>
          ) : null}

          {activeTab === 'trips' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">My itineraries</h2>
                <Link
                  href="/itinerary/new"
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                >
                  Plan a new itinerary
                </Link>
              </header>

              {itineraries.length === 0 ? (
                <div className="border border-border rounded-sm p-8 bg-paper text-center">
                  <p className="text-sm text-muted">No itineraries yet. Plan your first Da Nang trip.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-sm">
                  {itineraries.map((b: any) => {
                    const badge =
                      b.status === 'confirmed'
                        ? 'badge-success'
                        : b.status === 'completed'
                        ? 'badge-info'
                        : b.status === 'cancelled'
                        ? 'badge-danger'
                        : 'badge-warning'
                    return (
                      <li key={b.id}>
                        <Link
                          href={`/itinerary/${b.id}`}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-paper transition-colors duration-150"
                        >
                          <div>
                            <p className="text-sm font-medium text-ink">{b.title ?? 'Itinerary'}</p>
                            <p className="text-xs text-muted mt-1">
                              {b.start_date ? new Date(b.start_date).toLocaleDateString('en-US') : ''}
                              {b.destination ? ` · ${b.destination}` : ''}
                            </p>
                          </div>
                          <span className={`badge ${badge} text-xs capitalize`}>
                            {b.status ?? 'planning'}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
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
                            Review for {r.reviewee?.full_name ?? 'Buddy'}
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
                currentRole="tourist"
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
                  This permanently removes your profile, trips, messages, and reviews. There is no
                  undo.
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

      {/* Travel history — past Focus sessions */}
      <div className="mt-6">
        <TravelHistory />
      </div>
    </div>
  )
}
