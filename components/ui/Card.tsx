import * as React from 'react';

type CardProps = {
  children: React.ReactNode;
  as?: 'div' | 'article' | 'section' | 'aside';
  interactive?: boolean;
  /** Render the card with a SOLID color emphasis. Use for cards on
   * hero/dashboard/map pages; keep `false` (default) for dense data
   * pages. The default is the paper surface — never an alpha tint. */
  emphasis?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'ref'>;

/**
 * LOCALit Card — flat, 1px border, no shadow, no hover lift, no alpha.
 * Two surfaces: paper (default) and surface-deep (emphasis). Both are
 * solid colors so the design system has no transparent cards and no
 * alpha-tinted backgrounds.
 *
 * 2026-10-10 v5 recolor: removed `transparent` (alpha background) and
 * `surface-transparent` utility. Every card is a single solid color.
 */
export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { children, as: Component = 'div', interactive = false, emphasis = false, className, ...props },
  ref
) {
  const baseClasses = emphasis
    ? 'bg-surface-deep border border-tourist-border rounded-sm p-6'
    : 'bg-paper border border-border rounded-sm p-6';
  const hoverClasses = interactive ? 'transition-colors duration-150 hover:border-border-strong' : '';
  const classes = [baseClasses, hoverClasses, className ?? ''].filter(Boolean).join(' ');

  return React.createElement(Component, { ref, className: classes, ...props }, children);
});
