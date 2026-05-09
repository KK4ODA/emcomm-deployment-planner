import React from 'react';

/**
 * Pure visual: shows the user's profile image if set, otherwise their initial.
 * Used in Profile (large), Layout dropdown (small), etc.
 */

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-20 h-20 text-3xl',
};

export default function UserAvatar({ user, size = 'md', className = '' }) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const initial = user?.full_name?.charAt(0)?.toUpperCase()
    || user?.email?.charAt(0)?.toUpperCase()
    || '?';
  const imageUrl = user?.profile_image_url || null;

  if (imageUrl) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden bg-slate-200 flex-shrink-0 ${className}`}>
        <img
          src={imageUrl}
          alt={user?.full_name || 'User'}
          className="w-full h-full object-cover"
          // If the image fails to load (deleted, network), the alt text shows;
          // we don't fall back to initials here to keep this component pure.
        />
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center flex-shrink-0 ${className}`}>
      <span className="text-white font-medium">{initial}</span>
    </div>
  );
}
