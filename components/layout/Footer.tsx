import Link from 'next/link';

/**
 * Footer (2026-10-01 — single-web).
 *
 * After retiring the tourist/buddy URL split, the footer's two-column
 * "If you are visiting / If you live in Da Nang" structure collapses
 * to a single "Explore" column. The buddy CTA survives as one line at
 * the bottom of the hero capsule above the nav grid; the navigation
 * grid itself is a flat list of the 5 destination pages.
 */
export default function Footer() {
  return (
    <footer className="border-t border-border bg-paper mt-16">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12 pb-8 border-b border-border">
          <h2 className="text-2xl font-semibold text-ink mb-3 tracking-tight">
            Find a local buddy in Da Nang
          </h2>
          <p className="text-base text-muted max-w-2xl leading-relaxed">
            LOCALit is a Da Nang marketplace for one-on-one travel companionship.
            Six verified local guides, hourly rates from $15 to $45 USD, no
            booking fee through 2026. Browse profiles, message the buddy, meet
            at Han River, My Khe Beach, or wherever you want to start.
          </p>
          <p className="text-xs text-subtle mt-3">
            Kỳ 8 capstone project · Made in Da Nang, Vietnam
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <nav aria-label="Explore">
            <h3 className="text-eyebrow mb-3">Explore</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/browse" className="text-muted hover:text-ink transition-colors duration-150">
                  Browse buddies
                </Link>
              </li>
              <li>
                <Link href="/map" className="text-muted hover:text-ink transition-colors duration-150">
                  Live buddy map
                </Link>
              </li>
              <li>
                <Link href="/trips" className="text-muted hover:text-ink transition-colors duration-150">
                  Trips
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Account">
            <h3 className="text-eyebrow mb-3">Account</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/login" className="text-muted hover:text-ink transition-colors duration-150">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-muted hover:text-ink transition-colors duration-150">
                  Sign up
                </Link>
              </li>
              <li>
                <Link href="/profile" className="text-muted hover:text-ink transition-colors duration-150">
                  My profile
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Get involved">
            <h3 className="text-eyebrow mb-3">Get involved</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/register?role=buddy" className="text-muted hover:text-ink transition-colors duration-150">
                  Become a buddy
                </Link>
              </li>
              <li>
                <Link href="/chat" className="text-muted hover:text-ink transition-colors duration-150">
                  Messages
                </Link>
              </li>
              <li>
                <Link href="/itinerary" className="text-muted hover:text-ink transition-colors duration-150">
                  Itineraries
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Support">
            <h3 className="text-eyebrow mb-3">Support</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="mailto:support@localit.dev"
                  className="text-muted hover:text-ink transition-colors duration-150"
                >
                  support@localit.dev
                </a>
              </li>
              <li>
                <Link href="/forgot-password" className="text-muted hover:text-ink transition-colors duration-150">
                  Forgot password
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row sm:justify-between gap-3 text-xs text-muted">
          <p>&copy; 2026 LOCALit. Da Nang, Vietnam.</p>
          <p>0% commission through the 2026 launch period.</p>
        </div>
      </div>
    </footer>
  );
}