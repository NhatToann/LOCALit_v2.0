import * as React from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-paper border border-primary hover:bg-primary-hover',
  secondary: 'bg-ink text-paper border border-ink hover:bg-ink/90',
  outline: 'bg-transparent text-ink border border-border-strong hover:bg-paper',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-paper hover:text-ink',
  danger: 'bg-danger-bg text-danger border border-danger-bg hover:bg-danger hover:text-paper',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * LOCALit Button — flat, 4px radius, no shadow (per design.md Section 6.1).
 * Hover darkens background by 1 step (no lift, no shadow).
 *
 * Anti-slop check: never pill-shaped, never glowing, never with shadow.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, className, children, loading, disabled, type = 'button', ...props },
  ref
) {
  const classes = [
    'inline-flex items-center justify-center gap-2 font-medium rounded-sm transition-colors duration-150 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} {...props}>
      {loading ? <span className="loading-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
