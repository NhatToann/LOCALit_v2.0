// components/layout/Footer.tsx — slim 4-column footer with AEO answer capsule.
// 2026-10-09: 4-color brand gradient (Tourist → Buddy → Info → Hot) on the
// top stripe. Per design.md Section 2.1, this is one of the two places
// the full brand gradient is allowed (the other is the Header brand mark).
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-16">
      {/* 4-color brand gradient stripe — Tourist → Buddy → Info → Hot.
          Shows all 4 role colors at the top of every page. */}
      <div className="h-[3px] bg-gradient-4" aria-hidden="true" />
      <div className="border-t border-border bg-surface/85 backdrop-blur-0">
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
            <div>
              <h3 className="text-eyebrow mb-3">Explore</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/browse" className="text-muted hover:text-ink transition-colors duration-150">
                    Browse buddies
                  </Link>
                </li>
                <li>
                  <Link href="/trips" className="text-muted hover:text-ink transition-colors duration-150">
                    Trips
                  </Link>
                </li>
                <li>
                  <Link href="/map" className="text-muted hover:text-ink transition-colors duration-150">
                    Map
                  </Link>
                </li>
                <li>
                  <Link href="/search" className="text-muted hover:text-ink transition-colors duration-150">
                    Search
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-eyebrow mb-3">Account</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/login" className="text-muted hover:text-ink transition-colors duration-150">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="text-muted hover:text-ink transition-colors duration-150">
                    Create account
                  </Link>
                </li>
                <li>
                  <Link href="/profile" className="text-muted hover:text-ink transition-colors duration-150">
                    My profile
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="text-muted hover:text-ink transition-colors duration-150">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
            <div>
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
                    Itinerary planner
                  </Link>
                </li>
                <li>
                  <Link href="/matches" className="text-muted hover:text-ink transition-colors duration-150">
                    Matches
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-eyebrow mb-3">Support</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="mailto:hello@localit.dev"
                    className="text-muted hover:text-ink transition-colors duration-150"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <Link href="/forgot-password" className="text-muted hover:text-ink transition-colors duration-150">
                    Reset password
                  </Link>
                </li>
                <li>
                  <Link href="/llms.txt" className="text-muted hover:text-ink transition-colors duration-150">
                    llms.txt
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-border flex flex-col sm:flex-row sm:justify-between gap-3 text-xs text-muted">
            <p>&copy; 2026 LOCALit. Da Nang, Vietnam.</p>
            <p>0% commission through the 2026 launch period.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
