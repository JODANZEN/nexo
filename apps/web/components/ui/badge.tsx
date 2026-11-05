import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-nexo-navy/10 text-nexo-navy',
        accent: 'bg-nexo-teal/15 text-nexo-teal',
        success: 'bg-emerald-50 text-emerald-600',
        warning: 'bg-amber-50 text-amber-600',
        danger: 'bg-red-50 text-red-600',
        muted: 'bg-nexo-bg text-nexo-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
