import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-md border border-[var(--color-input)] bg-transparent px-3 py-2 text-sm shadow-sm transition-colors',
      'placeholder:text-[var(--color-muted-foreground)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-[invalid=true]:border-[var(--color-destructive)] aria-[invalid=true]:focus-visible:ring-[var(--color-destructive)]',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
