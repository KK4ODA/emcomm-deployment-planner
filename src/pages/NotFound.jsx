import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { ROUTES } from '@/app/routes';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description={<>There is nothing at <code className="rounded bg-muted px-1 font-mono text-xs">{pathname}</code>.</>}
      action={<Button asChild><Link to={ROUTES.dashboard}>Back to dashboard</Link></Button>}
    />
  );
}
