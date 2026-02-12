import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Command({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-md border border-border bg-background', className)} {...props} />;
}

export function CommandList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('max-h-80 overflow-auto', className)} {...props} />;
}

export function CommandItem({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer items-start gap-2 border-b border-border/70 px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
