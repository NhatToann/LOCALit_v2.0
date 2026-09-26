import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LOCALit — Find Local Buddies in Da Nang, Vietnam',
  description:
    'LOCALit connects travelers with verified local guides in Da Nang. Browse 6+ English-speaking buddies, hourly rates from $15 USD, 0% commission during 2026 launch.',
  openGraph: {
    title: 'LOCALit — Find Local Buddies in Da Nang',
    description: 'Connect with verified local guides in Da Nang, Vietnam. From $15/hour.',
    type: 'website',
    url: 'https://localit-nhattoann.vercel.app',
  },
};

const HOME_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much does a LOCALit buddy in Da Nang cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'LOCALit buddies in Da Nang charge between $15 and $45 per hour, set by each buddy based on language count and specialty depth. LOCALit charges 0% commission during the 2026 launch period.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is LOCALit safe for first-time travelers to Vietnam?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'LOCALit requires every buddy to verify their email and submit a phone number at signup. Buddy profiles show their specialties, languages, hourly rate, and any prior review ratings. Tourists can message before booking.',
      },
    },
    {
      '@type': 'Question',
      name: 'What languages do LOCALit buddies speak?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Da Nang buddies speak Vietnamese natively and English at conversational or fluent level. Several buddies also speak Korean, Japanese, Mandarin, French, or Russian. Each profile lists the languages the buddy self-reports.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I plan a day trip from Da Nang with a LOCALit buddy?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Da Nang sits within 60 minutes of Hoi An, the Marble Mountains, Son Tra Peninsula, and Ba Na Hills. A typical day trip with a buddy runs 4 to 8 hours. You can pre-fill a trip itinerary in the LOCALit trips planner.',
      },
    },
  ],
};

const HOME_FAQ_VISIBLE = [
  {
    q: 'How much does a LOCALit buddy in Da Nang cost?',
    a: 'Buddies in Da Nang charge between $15 and $45 per hour, set by each buddy based on language count and specialty depth. LOCALit charges a 0% commission during the 2026 launch period.',
  },
  {
    q: 'Is LOCALit safe for first-time travelers to Vietnam?',
    a: 'Every buddy verifies their email and submits a phone number at signup. Each profile shows specialties, languages, hourly rate, and any prior review ratings. Tourists can message a buddy before booking.',
  },
  {
    q: 'What languages do LOCALit buddies speak?',
    a: 'Da Nang buddies speak Vietnamese natively and English at conversational or fluent level. Several buddies also speak Korean, Japanese, Mandarin, French, or Russian. The languages list on each profile is self-reported by the buddy.',
  },
  {
    q: 'Can I plan a day trip from Da Nang with a LOCALit buddy?',
    a: 'Yes. Da Nang sits within 60 minutes of Hoi An, the Marble Mountains, Son Tra Peninsula, and Ba Na Hills. A typical day trip runs 4 to 8 hours. You can pre-fill the trip itinerary in the LOCALit trips planner.',
  },
];

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <main className="min-h-screen pt-16" aria-busy="true" aria-label="Loading home page">
      <div className="container-page py-16">
        <div className="skeleton h-12 w-2/3 mb-4" />
        <div className="skeleton h-6 w-1/2 mb-8" />
        <div className="skeleton h-64 w-full" />
      </div>
    </main>
  );
}

function HomeContent() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_FAQ_SCHEMA) }}
      />

      {/* ============= HERO ============= */}
      <section
        className="relative bg-ink text-paper"
        aria-labelledby="hero-title"
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-60"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1528127269322-539801943592?w=1920&q=80&auto=format&fit=crop')",
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-ink/50" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32 text-center">
          <p className="text-eyebrow text-paper/70 mb-4">
            Verified local guides · Da Nang, Vietnam
          </p>
          <h1 id="hero-title" className="text-display text-paper mb-4 max-w-3xl mx-auto">
            Find a local buddy in Da Nang
          </h1>
          <p className="text-lg text-paper/80 max-w-2xl mx-auto mb-8 leading-relaxed">
            Browse 6+ English-speaking Da Nang buddies. Hourly rates from $15 to $45.
            Zero commission during the 2026 launch period.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-3">
            <a
              href="/tourist/browse"
              className="inline-flex items-center justify-center h-12 px-6 text-base font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              Browse Da Nang buddies
            </a>
            <a
              href="/register?role=buddy"
              className="inline-flex items-center justify-center h-12 px-6 text-base font-medium rounded-sm bg-transparent text-paper border border-paper/40 hover:bg-paper/10"
            >
              Become a buddy
            </a>
          </div>
          <a
            href="/login"
            className="text-sm text-paper/80 hover:text-paper underline underline-offset-4"
          >
            Already have an account? Sign in
          </a>
        </div>
      </section>

      {/* ============= WHAT IS LOCALIT ============= */}
      <section className="py-20" aria-labelledby="about-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="about-title" className="text-page-title mb-6 max-w-3xl">
            LOCALit connects travelers with verified local guides in Da Nang
          </h2>
          <p className="text-base text-muted max-w-2xl mb-12 leading-relaxed">
            LOCALit is a Da Nang marketplace for one-on-one travel companionship.
            Tourists browse buddy profiles by specialty, language, and rating.
            Buddies accept requests and meet travelers at agreed Da Nang locations.
            Trips are tracked in the LOCALit itinerary planner.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="border border-border rounded-sm p-6 bg-surface">
              <p className="text-2xl font-semibold text-ink mb-1">6+</p>
              <p className="text-sm text-muted">Da Nang buddies currently accepting requests</p>
            </article>
            <article className="border border-border rounded-sm p-6 bg-surface">
              <p className="text-2xl font-semibold text-ink mb-1">$15–$45</p>
              <p className="text-sm text-muted">Hourly rate range across all buddies</p>
            </article>
            <article className="border border-border rounded-sm p-6 bg-surface">
              <p className="text-2xl font-semibold text-ink mb-1">0%</p>
              <p className="text-sm text-muted">LOCALit commission through 2026</p>
            </article>
          </div>
        </div>
      </section>

      {/* ============= WHAT YOU CAN DO ============= */}
      <section className="py-20 border-t border-border" aria-labelledby="actions-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="actions-title" className="text-page-title mb-6">
            What you can do on LOCALit
          </h2>
          <ul className="space-y-3 text-base max-w-2xl">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1" aria-hidden="true">→</span>
              <span>Browse buddies by specialty, language, hourly rate, and rating</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1" aria-hidden="true">→</span>
              <span>See which buddies are physically in Da Nang right now on the live map</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1" aria-hidden="true">→</span>
              <span>Send a connection request with proposed date and meeting point</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1" aria-hidden="true">→</span>
              <span>Plan a multi-stop Da Nang itinerary with 1 to 5 stops</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1" aria-hidden="true">→</span>
              <span>Message your buddy in-app before, during, and after the trip</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1" aria-hidden="true">→</span>
              <span>Leave a rating and review after a completed trip</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ============= WHO IT'S FOR ============= */}
      <section className="py-20 border-t border-border" aria-labelledby="for-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="for-title" className="text-page-title mb-6">
            Who LOCALit is for
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            <article className="border border-border rounded-sm p-6 bg-surface">
              <h3 className="text-lg font-semibold mb-2">For travelers</h3>
              <p className="text-sm text-muted leading-relaxed">
                First-time visitors to Da Nang who want local context without a guided tour bus.
                Anyone who wants to eat at the cơm gà stall the locals eat at, not the one
                TripAdvisor lists first.
              </p>
            </article>
            <article className="border border-border rounded-sm p-6 bg-surface">
              <h3 className="text-lg font-semibold mb-2">For local guides</h3>
              <p className="text-sm text-muted leading-relaxed">
                Da Nang residents who want to share their city with visitors and earn
                $15 to $45 per hour on their own schedule. Set your own hourly rate, languages,
                and the neighborhoods you cover.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ============= FAQ ============= */}
      <section className="py-20 border-t border-border" aria-labelledby="faq-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="faq-title" className="text-page-title mb-8">
            Questions travelers ask before booking a Da Nang buddy
          </h2>
          <dl className="faq-list max-w-3xl">
            {HOME_FAQ_VISIBLE.map((item) => (
              <div key={item.q} className="faq-item">
                <dt className="faq-question">{item.q}</dt>
                <dd className="faq-answer">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
