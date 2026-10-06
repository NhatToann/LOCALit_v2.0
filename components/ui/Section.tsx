/**
 * Section — vertical rhythm wrapper with two spacing variants
 *
 * Per `frontend-design` skill: "Section spacing: 96px desktop, 48px mobile
 * (varied, not uniform). Section spacing between dense and breathing
 * sections: 48px."
 *
 * LOCALit's homepage has 4 sections (hero, numbers, how-it-works, FAQ).
 * Hero is `breathing` (96px/48px). Numbers and FAQ are `dense` (48px/24px)
 * because they're information-heavy and need to compress.
 *
 * Usage:
 *   <Section variant="breathing">…</Section>   // hero, prose pages
 *   <Section variant="dense">…</Section>      // browse, dashboard, lists
 *   <Section variant="default">…</Section>    // 80px/40px fallback
 */
type SectionVariant = 'breathing' | 'default' | 'dense'

const SPACING: Record<SectionVariant, string> = {
  // py-24 md:py-32 = 96/128 (hero, FAQ)
  breathing: 'py-16 md:py-24',
  // py-20 md:py-24 = 80/96 (how-it-works, single-purpose sections)
  default: 'py-12 md:py-20',
  // py-12 md:py-16 = 48/64 (numbers, browse, dashboard tables)
  dense: 'py-10 md:py-12',
}

export function Section({
  variant = 'default',
  bordered = false,
  id,
  ariaLabelledby,
  className,
  children,
}: {
  variant?: SectionVariant
  /** Add a top border to separate from previous section (Da Nang print: paper-on-paper). */
  bordered?: boolean
  id?: string
  ariaLabelledby?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={[
        SPACING[variant],
        bordered ? 'border-t border-border' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="max-w-7xl mx-auto px-6">{children}</div>
    </section>
  )
}
