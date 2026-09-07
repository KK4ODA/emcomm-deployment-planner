import React from 'react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
};

/**
 * Profile image if set, otherwise the user's initial(s).
 * @param {{ user: { full_name?: string, email?: string, profile_image_url?: string|null }|null, size?: keyof typeof SIZE_CLASSES, className?: string }} props
 */
export function UserAvatar({ user, size = 'md', className }) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const name = user?.full_name || user?.email || '';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('') || '?';
  const imageUrl = user?.profile_image_url || null;

  if (imageUrl) {
    return (
      <span className={cn(sizeClass, 'inline-block shrink-0 overflow-hidden rounded-full bg-muted', className)}>
        <img src={imageUrl} alt={user?.full_name || 'User'} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(sizeClass, 'inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground', className)}
    >
      {initials}
    </span>
  );
}
