import * as React from 'react';
import { Icon } from './Icon';
import { type LucideIcon } from 'lucide-react';

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  online?: boolean;
  className?: string;
};

const sizeMap = {
  xs: 'avatar-xs',
  sm: 'avatar-sm',
  md: 'avatar-md',
  lg: 'avatar-lg',
  xl: 'avatar-xl',
  '2xl': 'avatar-2xl',
} as const;

const sizePx = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  '2xl': 120,
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  // Brand-aligned flat palette. Avoids neutral greys that would
  // disappear against the dark-mode paper/surface backgrounds.
  const palette = ['#FF6B35', '#92400E', '#166534', '#075985', '#7C2D12', '#5B21B6']
  const idx = Math.abs(hash) % palette.length
  return palette[idx]
}

/**
 * LOCALit Avatar — circular, hash-derived color, initials fallback.
 * Per design.md Section 6.5.
 *
 * Future: replace initials fallback with DiceBear API call (Phase 2).
 */
export function Avatar({ name, src, size = 'md', online, className }: AvatarProps) {
  const initials_ = initials(name);
  const bgColor = colorFromName(name);

  const baseClasses = ['avatar', sizeMap[size], className ?? ''].filter(Boolean).join(' ');

  if (src) {
    return (
      <span className="relative inline-block">
        <span className={baseClasses} style={{ backgroundColor: bgColor }}>
          <img src={src} alt={`${name} avatar`} loading="lazy" width={sizePx[size]} height={sizePx[size]} />
        </span>
        {online ? (
          <span
            aria-label="Online"
            className="absolute bottom-0 right-0 inline-block w-3 h-3 bg-success border-2 border-surface rounded-full"
          />
        ) : null}
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <span className={baseClasses} style={{ backgroundColor: bgColor }} aria-label={name}>
        {initials_}
      </span>
      {online ? (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 inline-block w-3 h-3 bg-success border-2 border-surface rounded-full"
        />
      ) : null}
    </span>
  );
}

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon: I, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {I ? <Icon icon={I} size={48} className="mx-auto mb-4 text-subtle" /> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
