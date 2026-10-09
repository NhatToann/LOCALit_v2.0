import * as React from 'react';

type Status = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'tourist' | 'buddy';

type StatusBadgeProps = {
  status: Status;
  children: React.ReactNode;
  className?: string;
};

const statusClasses: Record<Status, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-stone-100 text-muted',
  // 2-role variants (2026-10-10 v5 recolor) — solid pill variants for
  // role tags. Soft variants (.role-badge-*-soft in globals.css) are
  // used when the badge should be lower-emphasis.
  tourist: 'bg-tourist text-white border border-tourist',
  buddy: 'bg-buddy text-white border border-buddy',
};

/**
 * LOCALit StatusBadge — pill shape, semantic colors (per design.md Section 6.4).
 * Always pairs with icon + text for accessibility (color is never the only signal).
 */
export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const classes = ['badge', statusClasses[status], className ?? ''].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}
