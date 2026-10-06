/**
 * MetricCard — declarative number card with monospace metric + bilingual label
 *
 * Per `frontend-design` skill: "Typography carries the personality of the
 * page. You don't need a different typeface for display or headline text
 * and body content — use one family or two, and if two, make them clearly
 * distinct."
 *
 * LOCALit uses Plus Jakarta Sans (display + body) + JetBrains Mono (data).
 * Numbers and money get the mono family: they look measured, not marketing.
 *
 * Tabular numerals prevent layout shift when the value re-renders.
 *
 * Usage:
 *   <MetricCard value="6+" label="Da Nang buddies accepting requests" labelVi="đang nhận" />
 *   <MetricCard value="$15–$45" label="Hourly rate range" labelVi="giá theo giờ" />
 */
export function MetricCard({
  value,
  label,
  labelVi,
}: {
  value: string
  /** English descriptive label */
  label: string
  /** Vietnamese parallel — small, italic, muted */
  labelVi: string
}) {
  return (
    <article className="border border-border rounded-sm p-6 bg-surface">
      <p
        className="text-5xl font-medium text-ink mb-3"
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </p>
      <p className="text-sm text-muted leading-snug">{label}</p>
      <p
        className="text-xs italic text-muted leading-snug"
        style={{ letterSpacing: '0.01em' }}
        aria-hidden="true"
      >
        {labelVi}
      </p>
    </article>
  )
}
