/**
 * BilingualLabel — Vietnamese print tradition as a design motif
 *
 * Per `frontend-design` skill: "Subject's industry, subject matter, materials,
 * and vernacular are where distinctive visual choices come from." LOCALit's
 * subject is Da Nang tourism; the bilingual print tradition is its vernacular.
 *
 * Usage:
 *   <BilingualLabel en="Buddies" vi="Hướng dẫn viên" />
 *   <BilingualLabel en="Trips" vi="Chuyến đi" size="sm" />
 *
 * Visual:
 *   English  (12-14px, --ink, font-medium)
 *   Tiếng Việt  (12-14px, --muted, italic, slight tracking)
 *   One per line, baseline-aligned, no separator.
 *
 * Accessibility: a single accessible name is rendered via the `aria-label`
 * on the wrapper, picking the English string. The Vietnamese line is
 * aria-hidden (it's a visual motif, not a translation requirement).
 */
type BilingualLabelSize = 'sm' | 'md'

const SIZE_CLASS: Record<BilingualLabelSize, { en: string; vi: string }> = {
  sm: { en: 'text-xs', vi: 'text-xs' },
  md: { en: 'text-sm', vi: 'text-sm' },
}

export function BilingualLabel({
  en,
  vi,
  size = 'sm',
  as: Tag = 'span',
  className,
}: {
  en: string
  vi: string
  size?: BilingualLabelSize
  /** Wrapper tag. Use 'dt' if rendering inside a <dl>. */
  as?: 'span' | 'div' | 'dt' | 'p' | 'h3' | 'h4'
  className?: string
}) {
  const sizes = SIZE_CLASS[size]
  return (
    <Tag
      className={className}
      aria-label={en}
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}
    >
      <span className={`${sizes.en} font-medium text-ink leading-none`}>{en}</span>
      <span
        className={`${sizes.vi} italic text-muted leading-none`}
        style={{ letterSpacing: '0.01em' }}
        aria-hidden="true"
      >
        {vi}
      </span>
    </Tag>
  )
}
