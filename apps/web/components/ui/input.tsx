import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm text-nexo-text placeholder:text-nexo-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexo-teal',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
