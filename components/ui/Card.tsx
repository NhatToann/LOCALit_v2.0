import * as React from 'react';

type CardProps = {
  children: React.ReactNode;
  as?: 'div' | 'article' | 'section' | 'aside';
  interactive?: boolean;
  /** Render the card with a semi-transparent background so the Da Nang
   * photo backdrop shows through. Use for cards on hero/dashboard/map
   * pages; keep `false` (default) for dense data pages where the photo
   * would compete with the text. */
  transparent?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'ref'>;

/**
 * LOCALit Card — flat with 1px border, no shadow, no hover lift (per design.md Section 6.3).
 * Anti-slop check: never glassmorphism, never glowing border, never 16px radius.
 *
 * 2026-10-09 v3 recolor: the `transparent` prop renders a paper background
 * at 82% opacity so the Da Nang photo backdrop shows through. The default
 * is the solid surface — dense data pages still need a clean canvas.
 */
export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { children, as: Component = 'div', interactive = false, transparent = false, className, ...props },
  ref
) {
  const baseClasses = transparent
    ? 'surface-transparent border border-border rounded-sm p-6'
    : 'bg-surface border border-border rounded-sm p-6'
  const hoverClasses = interactive ? 'transition-colors duration-150 hover:border-border-strong' : '';
  const classes = [baseClasses, hoverClasses, className ?? ''].filter(Boolean).join(' ');

  return React.createElement(Component, { ref, className: classes, ...props }, children);
});
