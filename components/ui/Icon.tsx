import * as React from 'react';
import { type LucideIcon } from 'lucide-react';

type IconProps = {
  icon: LucideIcon;
  size?: number;
} & Omit<React.SVGProps<SVGSVGElement>, 'size'>;

/**
 * LOCALit Icon wrapper around lucide-react.
 * - Always `aria-hidden="true"` by default (pass aria-hidden={false} if needed)
 * - 2px stroke, currentColor
 * - Default size 20px (matches body line-height for inline use)
 *
 * Per design.md Section 5: Lucide is the only icon library used.
 * Per web-ai-slop Section 1a: no emoji as icons.
 */
export function Icon({ icon: I, size = 20, ...props }: IconProps) {
  return <I size={size} strokeWidth={2} aria-hidden="true" {...props} />;
}
