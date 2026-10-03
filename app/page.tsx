import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LOCALit — Da Nang Local Buddies, $15 to $45 per hour',
  description:
    '6 English-speaking Da Nang buddies on the platform right now. Hourly rates from $15 to $45 USD set by each guide. 0% LOCALit commission through the 2026 launch.',
  openGraph: {
    title: 'LOCALit — Da Nang Local Buddies, $15 to $45 per hour',
    description: '6 verified Da Nang buddies, $15–$45 hourly, 0% commission through 2026.',
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
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1572551562325-b5d5057c9b54?w=1920&q=80&auto=format&fit=crop')",
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-ink/55" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32 text-center">
          <p className="text-eyebrow text-paper/70 mb-4">
            Han River, Da Nang — verified local guides
          </p>
          <h1 id="hero-title" className="text-display text-paper mb-4 max-w-3xl mx-auto">
            Find a local buddy in Da Nang
          </h1>
          <p className="text-lg text-paper/80 max-w-2xl mx-auto mb-8 leading-relaxed">
            6 English-speaking Da Nang buddies on the platform right now. Hourly
            rates from $15 to $45 USD. Zero commission through the 2026 launch.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-3">
            <a
              href="/browse"
              className="inline-flex items-center justify-center h-12 px-6 text-base font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              Browse Da Nang buddies
            </a>
          </div>
          <p className="text-sm text-paper/70">
            Or{' '}
            <a href="/register?role=buddy" className="underline underline-offset-4 hover:text-paper">
              earn $15–$45/hour as a Da Nang buddy
            </a>
            .
          </p>
        </div>
      </section>

      {/* ============= TRUST / NUMBERS ============= */}
      <section className="py-20" aria-labelledby="numbers-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="numbers-title" className="text-page-title mb-3 max-w-3xl">
            Six buddies, three neighborhoods, zero commission
          </h2>
          <p className="text-base text-muted max-w-2xl mb-12 leading-relaxed">
            The platform lists every Da Nang buddy who has completed email
            verification and pinned their location. Rates and availability are
            set by each buddy; LOCALit adds no booking fee.
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="border border-border rounded-sm p-6 bg-surface">
              <dt className="sr-only">Da Nang buddies currently accepting requests</dt>
              <dd className="text-3xl font-semibold text-ink mb-1 tabular-nums">6+</dd>
              <p className="text-sm text-muted">Da Nang buddies currently accepting requests</p>
            </article>
            <article className="border border-border rounded-sm p-6 bg-surface">
              <dt className="sr-only">Hourly rate range across all buddies</dt>
              <dd className="text-3xl font-semibold text-ink mb-1 tabular-nums">$15–$45</dd>
              <p className="text-sm text-muted">Hourly rate range across all buddies, set by each guide</p>
            </article>
            <article className="border border-border rounded-sm p-6 bg-surface">
              <dt className="sr-only">LOCALit commission through 2026</dt>
              <dd className="text-3xl font-semibold text-ink mb-1 tabular-nums">0%</dd>
              <p className="text-sm text-muted">LOCALit commission through 2026 launch period</p>
            </article>
          </dl>
        </div>
      </section>

      {/* ============= HOW IT WORKS ============= */}
      <section className="py-20 border-t border-border" aria-labelledby="how-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="how-title" className="text-page-title mb-3 max-w-3xl">
            How LOCALit works
          </h2>
          <p className="text-base text-muted max-w-2xl mb-12 leading-relaxed">
            Three steps from sign-up to your first hour on the Han River.
          </p>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl list-none">
            {[
              {
                step: '01',
                title: 'Sign up and verify',
                body:
                  'Create an account with email + phone. Verification is one OTP code; no KYC paperwork at launch.',
              },
              {
                step: '02',
                title: 'Pick a buddy or post a trip',
                body:
                  'Browse six verified Da Nang locals with hourly rates, languages, and specialties. Or sketch a trip and let buddies respond.',
              },
              {
                step: '03',
                title: 'Meet up in Da Nang',
                body:
                  'Chat in-app to lock a meeting point. Voice and video calls work inside the chat once both sides are online. 0% LOCALit fee.',
              },
            ].map((item) => (
              <li key={item.step} className="border border-border rounded-sm p-6 bg-surface">
                <p className="text-eyebrow text-primary mb-2 tabular-nums">Step {item.step}</p>
                <h3 className="text-xl font-semibold text-ink mb-3">{item.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-base text-muted max-w-2xl mt-10 leading-relaxed">
            Da Nang residents can{' '}
            <a href="/register?role=buddy" className="text-primary hover:underline underline-offset-4">
              sign up as a buddy
            </a>{' '}
            and set their own hourly rate, languages, and neighborhoods.
          </p>
        </div>
      </section>

      {/* ============= FAQ ============= */}
      <section className="py-20 border-t border-border" aria-labelledby="faq-title">
        <div className="max-w-7xl mx-auto px-6">
          <h2 id="faq-title" className="text-page-title mb-3 max-w-3xl">
            Questions travelers ask before booking a Da Nang buddy
          </h2>
          <p className="text-base text-muted max-w-2xl mb-8">
            Pricing, languages, safety, and how day trips work. Four answers, no
            filler.
          </p>
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
