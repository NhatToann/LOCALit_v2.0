import Link from 'next/link';
import { Globe } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-paper mt-16">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* AEO answer capsule (per design.md Section 7.1, skill.md Section 2.1) */}
        <div className="mb-12 pb-8 border-b border-border">
          <h2 className="text-page-title mb-3">Find a local buddy in Da Nang</h2>
          <p className="text-base text-muted max-w-2xl">
            LOCALit connects travelers with verified local guides in Da Nang, Vietnam.
            Buddies speak English, Vietnamese, Korean, Japanese, and Mandarin.
            Hourly rates range from $15 to $45 USD. LOCALit charges a 0% commission
            during the 2026 launch period.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3">
              <Globe size={24} className="text-primary" aria-hidden="true" />
              <span className="text-lg font-semibold text-ink">LOCALit</span>
            </Link>
            <p className="text-sm text-muted leading-relaxed">
              Connect with trusted local guides and explore Da Nang like a resident.
            </p>
          </div>

          {/* Explore */}
          <nav aria-label="Explore">
            <h3 className="text-eyebrow mb-3">Explore</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-muted hover:text-ink transition-colors duration-150">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/tourist/browse" className="text-muted hover:text-ink transition-colors duration-150">
                  Browse buddies
                </Link>
              </li>
              <li>
                <Link href="/map" className="text-muted hover:text-ink transition-colors duration-150">
                  Da Nang map
                </Link>
              </li>
              <li>
                <Link href="/tourist/trips" className="text-muted hover:text-ink transition-colors duration-150">
                  Trips
                </Link>
              </li>
            </ul>
          </nav>

          {/* For buddies */}
          <nav aria-label="For buddies">
            <h3 className="text-eyebrow mb-3">For buddies</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/buddy/dashboard" className="text-muted hover:text-ink transition-colors duration-150">
                  Buddy dashboard
                </Link>
              </li>
              <li>
                <Link href="/buddy/requests" className="text-muted hover:text-ink transition-colors duration-150">
                  Connection requests
                </Link>
              </li>
              <li>
                <Link href="/buddy/profile" className="text-muted hover:text-ink transition-colors duration-150">
                  Edit profile
                </Link>
              </li>
              <li>
                <Link href="/register?role=buddy" className="text-muted hover:text-ink transition-colors duration-150">
                  Become a buddy
                </Link>
              </li>
            </ul>
          </nav>

          {/* Support */}
          <nav aria-label="Support">
            <h3 className="text-eyebrow mb-3">Support</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/forgot-password" className="text-muted hover:text-ink transition-colors duration-150">
                  Forgot password
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@localit.dev"
                  className="text-muted hover:text-ink transition-colors duration-150"
                >
                  Contact support
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@localit.dev?subject=LOCALit%20feedback"
                  className="text-muted hover:text-ink transition-colors duration-150"
                >
                  Send feedback
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row sm:justify-between gap-3 text-xs text-muted">
          <p>&copy; 2026 LOCALit. Kỳ 8 Capstone Project, Da Nang.</p>
          <p>Made in Da Nang, Vietnam.</p>
        </div>
      </div>
    </footer>
  );
}
