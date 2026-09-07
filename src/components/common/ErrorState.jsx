import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Human-readable text for common failure shapes. */
export function describeError(error) {
  if (!error) return 'Unknown error';
  const message = error.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed|timeout/i.test(message)) {
    return 'The server could not be reached. Check your connection and try again.';
  }
  if (/JWT|401|not authenticated/i.test(message)) return 'Your session has expired. Sign in again.';
  if (/permission denied|42501|403/i.test(message)) return 'You do not have permission to do that.';
  return message;
}

/**
 * @param {{ title?: string, error?: unknown, onRetry?: () => void, retryLabel?: string, className?: string, compact?: boolean }} props
 */
export function ErrorState({ title = 'Could not load data', error, onRetry, retryLabel = 'Retry', className, compact = false }) {
  const detail = describeError(error);
  const offline = /could not be reached/i.test(detail);
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-destructive/30 bg-destructive/5 text-foreground',
        compact ? 'flex items-center gap-3 p-3' : 'flex flex-col items-center gap-3 p-8 text-center',
        className,
      )}
    >
      <Icon className={cn('shrink-0 text-destructive', compact ? 'h-5 w-5' : 'h-8 w-8')} aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground break-words">{detail}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className={compact ? 'ml-auto' : ''}>
          <RefreshCw /> {retryLabel}
        </Button>
      )}
    </div>
  );
}
