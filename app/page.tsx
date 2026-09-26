'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'

const FEATURED_DESTINATIONS = [
  { id: 'da-nang', name: 'Da Nang', area: 'My Khe Beach', tours: 45, rating: 4.9, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop', popular: true },
  { id: 'son-tra', name: 'Son Tra Peninsula', area: 'Linh Ung Pagoda', tours: 32, rating: 4.8, image: 'https://images.unsplash.com/photo-1573270689103-d7a4e42b609a?w=600&h=400&fit=crop', popular: true },
  { id: 'marble', name: 'Marble Mountains', area: 'Ngu Hanh Son', tours: 28, rating: 4.7, image: 'https://images.unsplash.com/photo-1591287083773-9a5e21d50c30?w=600&h=400&fit=crop', popular: false },
  { id: 'hai-van', name: 'Hai Van Pass', area: 'Cloud Hunting', tours: 21, rating: 4.9, image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=400&fit=crop', popular: false },
]

interface BuddyPreview {
  id: string
  full_name: string
  location_city: string | null
  languages: string[] | null
  specialties: string[] | null
  rating_avg: number | null
  hourly_rate: number | null
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen" aria-busy="true" aria-label="Loading home page">
          <div className="loading-spinner" role="status" aria-live="polite" />
        </main>
      }
    >
      <HomePageInner />
    </Suspense>
  )
}

function HomePageInner() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [searchDestination, setSearchDestination] = useState('Da Nang')
  const [searchDates, setSearchDates] = useState('')
  const [buddies, setBuddies] = useState<BuddyPreview[]>([])

  const searchParams = useSearchParams()
  const justSubscribed = searchParams.get('subscribed') === '1'
  const [showSubscribedToast, setShowSubscribedToast] = useState(justSubscribed)

  useEffect(() => {
    if (justSubscribed) {
      const t = setTimeout(() => setShowSubscribedToast(false), 5000)
      // Strip the query so refresh doesn't re-trigger
      router.replace('/')
      return () => clearTimeout(t)
    }
  }, [justSubscribed, router])

  useEffect(() => {
    async function init() {
      // Bypass auto-redirect when ?home=1 is present (useful for sharing the
      // marketing URL publicly or previewing the landing page in incognito).
      if (searchParams.get('home') === '1') {
        await loadBuddies()
        setLoading(false)
        return
      }

      const user = await getCurrentUser()
      if (user) {
        const supabase = createClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        const dest = profile?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'
        router.replace(dest)
        return
      }

      await loadBuddies()
      setLoading(false)
    }

    async function loadBuddies() {
      const supabase = createClient()
      // SECURITY: use safe_profiles (no PII columns) for the public join.
      // profiles itself is restricted to authenticated reads.
      const { data } = await supabase
        .from('buddies')
        .select('id, location_city, languages, specialties, rating_avg, hourly_rate, profile:safe_profiles(full_name)')
        .eq('is_available', true)
        .eq('location_city', 'Da Nang')
        .order('rating_avg', { ascending: false })
        .limit(3)

      if (data) {
        const mapped: BuddyPreview[] = data.map((b: any) => ({
          id: b.id,
          full_name: b.profile?.full_name ?? 'Buddy',
          location_city: b.location_city,
          languages: b.languages ?? [],
          specialties: b.specialties ?? [],
          rating_avg: b.rating_avg ?? 0,
          hourly_rate: b.hourly_rate ?? 0,
        }))
        setBuddies(mapped)
      }
    }

    init()
  }, [router, searchParams])

  const heroStats = useMemo(() => [
    { number: `${buddies.length || 6}+`, label: 'Da Nang Buddies' },
    { number: '4.9', label: 'Average rating' },
    { number: '24/7', label: 'Support' },
  ], [buddies.length])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (searchDestination.trim()) params.set('destination', searchDestination.trim())
    if (searchDates) params.set('date', searchDates)
    const qs = params.toString()
    router.push(qs ? `/tourist/browse?${qs}` : '/tourist/browse')
  }

  if (loading) {
    return (
      <main className="min-h-screen" aria-busy="true" aria-label="Loading home page">
        <div
          className="loading-spinner"
          role="status"
          aria-live="polite"
        />
      </main>
    )
  }

  return (
    <main>
      {showSubscribedToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 88,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#28A745',
            color: '#FFFFFF',
            padding: '12px 22px',
            borderRadius: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            zIndex: 100,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ✓ Subscribed! We&apos;ll keep you posted.
        </div>
      )}

      {/* ============= HERO ============= */}
      <section className="hero-section">
        <div className="hero-overlay" />
        <div className="hero-content container">
          <div className="hero-badge">
            <span className="dot" />
            <span>Local buddies ready to welcome you</span>
          </div>
          <h1 className="hero-title">
            Explore <span>Da Nang</span> with Local Buddies
          </h1>
          <p className="hero-subtitle">
            Connect with welcoming locals for authentic experiences and unforgettable journeys.
          </p>

          <div className="hero-stats">
            {heroStats.map((s) => (
              <div key={s.label} className="hero-stat">
                <span className="number">{s.number}</span>
                <span className="label">{s.label}</span>
              </div>
            ))}
          </div>

          <form className="search-box" onSubmit={handleSearch}>
            <div className="search-input-group">
              <span className="search-icon">📍</span>
              <label htmlFor="dest">Where do you want to go?</label>
              <input
                id="dest"
                type="text"
                placeholder="Da Nang"
                value={searchDestination}
                readOnly
              />
            </div>
            <div className="search-input-group">
              <span className="search-icon">📅</span>
              <label htmlFor="dates">Start date</label>
              <input
                id="dates"
                type="date"
                value={searchDates}
                onChange={(e) => setSearchDates(e.target.value)}
              />
            </div>
            <button type="submit" className="search-btn">
              🔍 Find Buddy
            </button>
          </form>

          <div className="hero-cta">
            <Link href="/register?role=tourist" className="btn btn-primary btn-lg">
              🧳 I&apos;m a tourist
            </Link>
            <Link href="/register?role=buddy" className="btn btn-outline btn-lg btn-on-dark">
              🌍 I&apos;m a local buddy
            </Link>
          </div>
          <div className="hero-signin">
            <Link href="/login" className="hero-signin-link">
              Already have an account? Sign in →
            </Link>
          </div>
        </div>
      </section>

      {/* ============= FEATURED DESTINATIONS ============= */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Top Spots in Da Nang</h2>
            <Link href="/tourist/browse" className="section-link">See all buddies →</Link>
          </div>
          <div className="dest-grid">
            {FEATURED_DESTINATIONS.map((d) => (
              <Link
                key={d.id}
                href={`/tourist/browse?destination=${encodeURIComponent(d.name)}`}
                className={`dest-card ${d.popular ? 'popular' : ''}`}
              >
                <div className="dest-image">
                  <img src={d.image} alt={d.name} loading="lazy" />
                  {d.popular && <span className="dest-badge">Popular</span>}
                </div>
                <div className="dest-info">
                  <div className="dest-row">
                    <h3>{d.name}</h3>
                    <span className="dest-rating">⭐ {d.rating}</span>
                  </div>
                  <p className="text-muted text-sm">{d.area} · {d.tours}+ tours</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============= ONLINE BUDDIES ============= */}
      <section className="section section-alt">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Buddies online now</h2>
            <Link href="/tourist/browse" className="section-link">See all →</Link>
          </div>
          {buddies.length === 0 ? (
            <p className="text-center text-muted">No buddies available right now.</p>
          ) : (
            <div className="buddy-grid">
              {buddies.map((b) => (
                <Link key={b.id} href={`/tourist/buddy/${b.id}`} className="buddy-card">
                  <div className="buddy-avatar-lg">{b.full_name.charAt(0)}</div>
                  <h3 className="buddy-name">{b.full_name}</h3>
                  <p className="buddy-loc">📍 {b.location_city || 'Da Nang'}</p>
                  <div className="buddy-tags">
                    {(b.specialties ?? []).slice(0, 2).map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </div>
                  <div className="buddy-meta">
                    <span className="buddy-rating">⭐ {Number(b.rating_avg).toFixed(1)}</span>
                    {b.hourly_rate && b.hourly_rate > 0 && (
                      <span className="buddy-price">${Number(b.hourly_rate).toFixed(0)}/hour</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============= HOW IT WORKS ============= */}
      <section className="section">
        <div className="container">
          <div className="text-center">
            <h2 className="section-title">How it works</h2>
            <p className="text-muted mb-xl">Three simple steps to start your journey</p>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">1</div>
              <h3>Create your profile</h3>
              <p>Sign up free and tell us about your interests and travel style.</p>
            </div>
            <div className="step-card">
              <div className="step-num">2</div>
              <h3>Find the right buddy</h3>
              <p>Browse local Da Nang buddies by specialty, language, or rating.</p>
            </div>
            <div className="step-card">
              <div className="step-num">3</div>
              <h3>Connect & explore</h3>
              <p>Chat, plan your itinerary, and enjoy the trip together.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============= CTA ============= */}
      <section className="section">
        <div className="container">
          <div className="cta-card">
            <h2>Ready for your next Da Nang adventure?</h2>
            <p>Join travelers who are discovering Da Nang with LOCALit every day.</p>
            <div className="flex gap-md" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/register?role=tourist" className="btn btn-primary btn-lg">Get started free</Link>
              <Link href="/tourist/browse" className="btn btn-outline btn-lg">Browse buddies</Link>
            </div>
          </div>
        </div>
      </section>

      <style>{homeStyles}</style>
    </main>
  )
}

const homeStyles = `
.hero-section {
  position: relative;
  min-height: 720px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop');
  background-size: cover;
  background-position: center;
  padding: var(--space-3xl) var(--space-lg);
}
.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0,0,0,.7) 0%, rgba(0,0,0,.4) 50%, rgba(0,0,0,.6) 100%);
}
.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,.15);
  backdrop-filter: blur(10px);
  padding: 8px 16px;
  border-radius: 30px;
  margin-bottom: var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--text-light);
  border: 1px solid rgba(255,255,255,.2);
}
.hero-badge .dot {
  width: 8px; height: 8px;
  background: #4ade80;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}
.hero-title {
  font-size: clamp(2.4rem, 5.5vw, 4rem);
  font-weight: 800;
  color: var(--text-light);
  margin-bottom: var(--space-md);
  line-height: 1.1;
  text-align: center;
}
.hero-title span {
  background: linear-gradient(135deg, #FF6B35 0%, #FFB347 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-subtitle {
  font-size: var(--font-size-lg);
  color: rgba(255,255,255,.85);
  margin-bottom: var(--space-xl);
  max-width: 620px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
  text-align: center;
}
.hero-stats {
  display: flex;
  justify-content: center;
  gap: var(--space-2xl);
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
}
.hero-stat .number {
  display: block;
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--text-light);
}
.hero-stat .label {
  font-size: var(--font-size-sm);
  color: rgba(255,255,255,.7);
}
.search-box {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  background: rgba(255,255,255,.95);
  border-radius: 20px;
  padding: 12px;
  box-shadow: 0 24px 60px rgba(26,26,46,.28);
  max-width: 860px;
  margin: 0 auto var(--space-xl);
}
.search-input-group {
  position: relative;
  background: #fff;
  border: 1px solid #eceff3;
  border-radius: 14px;
  padding: 10px 14px 10px 40px;
  text-align: left;
}
.search-input-group label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #535b65;
  text-transform: uppercase;
  letter-spacing: .6px;
  margin-bottom: 2px;
}
.search-input-group input {
  border: none;
  outline: none;
  width: 100%;
  font-size: var(--font-size-sm);
  background: transparent;
}
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
}
.search-btn {
  background: var(--primary);
  color: var(--text-light);
  border: none;
  border-radius: 14px;
  padding: 0 24px;
  font-weight: 600;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.search-btn:hover {
  background: var(--primary-dark);
}
.hero-cta {
  display: flex;
  justify-content: center;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}
.btn-on-dark {
  background: transparent;
  color: var(--text-light);
  border-color: rgba(255,255,255,.4);
}
.btn-on-dark:hover {
  background: rgba(255,255,255,.15);
  color: var(--text-light);
  border-color: rgba(255,255,255,.7);
}
.hero-signin {
  text-align: center;
}
.hero-signin-link {
  color: rgba(255,255,255,.85);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.hero-signin-link:hover { color: #fff; }

/* SECTIONS */
.section { padding: var(--space-3xl) 0; }
.section-alt { background: var(--bg-white); }
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
  gap: var(--space-sm);
}
.section-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  text-align: left;
}
.section-link {
  color: var(--primary);
  font-weight: 500;
  font-size: var(--font-size-sm);
}
.section-link:hover { text-decoration: underline; }

/* DESTINATION GRID */
.dest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-md);
}
.dest-card {
  background: var(--bg-white);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow);
  transition: all var(--transition-fast);
  display: block;
}
.dest-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
}
.dest-image {
  position: relative;
  height: 160px;
  overflow: hidden;
}
.dest-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.dest-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: var(--primary);
  color: var(--text-light);
  padding: 4px 10px;
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-xs);
  font-weight: 600;
}
.dest-info { padding: var(--space-md); }
.dest-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.dest-row h3 { font-size: var(--font-size-lg); }
.dest-rating {
  color: var(--accent);
  font-weight: 600;
  font-size: var(--font-size-sm);
}

/* BUDDY GRID */
.buddy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-md);
}
.buddy-card {
  background: var(--bg-white);
  border-radius: var(--border-radius-lg);
  padding: var(--space-lg);
  text-align: center;
  box-shadow: var(--shadow);
  transition: all var(--transition-fast);
  display: block;
}
.buddy-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
}
.buddy-avatar-lg {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-3xl);
  font-weight: 700;
  margin: 0 auto var(--space-md);
}
.buddy-name {
  font-size: var(--font-size-lg);
  margin-bottom: 4px;
  text-align: center;
}
.buddy-loc {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-sm);
  text-align: center;
}
.buddy-tags {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: var(--space-sm);
}
.buddy-meta {
  display: flex;
  justify-content: center;
  gap: var(--space-md);
  font-size: var(--font-size-sm);
}
.buddy-rating { color: var(--accent); font-weight: 600; }
.buddy-price { color: var(--text-secondary); }

/* HOW IT WORKS */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
}
.step-card {
  text-align: center;
  padding: var(--space-xl);
  background: var(--bg-white);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow);
}
.step-num {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin: 0 auto var(--space-md);
}
.step-card h3 {
  font-size: var(--font-size-lg);
  margin-bottom: var(--space-sm);
}
.step-card p {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

/* CTA */
.cta-card {
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
  color: var(--text-light);
  padding: var(--space-3xl);
  border-radius: var(--border-radius-xl);
  text-align: center;
  box-shadow: var(--shadow-lg);
}
.cta-card h2 {
  font-size: var(--font-size-3xl);
  margin-bottom: var(--space-md);
}
.cta-card p {
  font-size: var(--font-size-lg);
  margin-bottom: var(--space-xl);
  opacity: .9;
}
.cta-card .btn-outline {
  background: transparent;
  color: var(--text-light);
  border-color: var(--text-light);
}
.cta-card .btn-outline:hover {
  background: rgba(255,255,255,.15);
  color: var(--text-light);
}

@media (max-width: 768px) {
  .hero-stats { gap: var(--space-md); }
  .search-box {
    grid-template-columns: 1fr;
  }
  .search-btn { padding: 14px 24px; }
}
`
