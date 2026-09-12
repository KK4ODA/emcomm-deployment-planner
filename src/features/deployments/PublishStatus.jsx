import React from 'react';
import { formatDateTime } from '@/lib/time';

/** One line under the Publish button: which version operators have, and since when. */
export function PublishStatus({ deployment, className = '' }) {
  if (!deployment) return null;
  const text = deployment.plan_published_at
    ? `v${deployment.plan_version || 1} published ${formatDateTime(deployment.plan_published_at, 'MMM d, HH:mm')}`
    : 'Not published yet';
  return <p className={`text-right text-xs text-muted-foreground ${className}`} aria-live="polite">{text}</p>;
}
