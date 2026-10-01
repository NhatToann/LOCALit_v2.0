import Link from 'next/link';

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <nav aria-label="Explore">
            <h3 className="text-eyebrow mb-3">If you are visiting Da Nang</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/browse" className="text-muted hover:text-ink transition-colors duration-150">
                  Browse 6 local buddies
                </Link>
              </li>
              <li>
                <Link href="/map" className="text-muted hover:text-ink transition-colors duration-150">
                  Live buddy map of Da Nang
                </Link>
              </li>
              <li>
                <Link href="/register?role=tourist" className="text-muted hover:text-ink transition-colors duration-150">
                  Sign up as a traveler
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="For Da Nang locals">
            <h3 className="text-eyebrow mb-3">If you live in Da Nang</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/register?role=buddy" className="text-muted hover:text-ink transition-colors duration-150">
                  Earn $15 to $45 per hour as a buddy
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-muted hover:text-ink transition-colors duration-150">
                  Buddy sign in
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@localit.dev"
                  className="text-muted hover:text-ink transition-colors duration-150"
                >
                  Questions: support@localit.dev
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row sm:justify-between gap-3 text-xs text-muted">
          <p>&copy; 2026 LOCALit. Da Nang, Vietnam.</p>
          <p>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
            {' · '}
            <Link href="/forgot-password" className="hover:text-ink">Forgot password</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
