import * as React from 'react';

type CardProps = {
  children: React.ReactNode;
  as?: 'div' | 'article' | 'section' | 'aside';
  interactive?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'ref'>;

/**
 * LOCALit Card — flat with 1px border, no shadow, no hover lift (per design.md Section 6.3).
 * Anti-slop check: never glassmorphism, never glowing border, never 16px radius.
 */
export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { children, as: Component = 'div', interactive = false, className, ...props },
  ref
) {
  const baseClasses = 'bg-surface border border-border rounded-sm p-6';
  const hoverClasses = interactive ? 'transition-colors duration-150 hover:border-border-strong' : '';
  const classes = [baseClasses, hoverClasses, className ?? ''].filter(Boolean).join(' ');

  return React.createElement(Component, { ref, className: classes, ...props }, children);
});
