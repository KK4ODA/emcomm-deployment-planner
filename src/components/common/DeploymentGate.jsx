import React from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, ShieldAlert, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';
import { PageSkeleton } from './LoadingState';
import { ErrorState } from './ErrorState';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { ROUTES } from '@/app/routes';

/**
 * Wrap deployment-scoped pages. Renders children only when a deployment is
 * selected and accessible; otherwise shows a clear explanation.
 */
export function DeploymentGate({ children }) {
  const { status, isError, selectDeployment } = useCurrentDeployment();

  if (isError) return <ErrorState title="Could not load deployments" />;
  if (status === 'loading') return <PageSkeleton />;

  if (status === 'none') {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No deployment selected"
        description="Pick a deployment from the switcher in the header, or open one from the Deployments page."
        action={<Button asChild><Link to={ROUTES.deployments}>Go to Deployments</Link></Button>}
      />
    );
  }
  if (status === 'forbidden') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access denied"
        description="This deployment belongs to an ARES group you are not a member of."
        action={<Button variant="outline" onClick={() => selectDeployment(null)}>Choose another deployment</Button>}
      />
    );
  }
  if (status === 'missing') {
    return (
      <EmptyState
        icon={SearchX}
        title="Deployment not found"
        description="The previously selected deployment no longer exists or is not visible to you."
        action={<Button variant="outline" onClick={() => selectDeployment(null)}>Clear selection</Button>}
      />
    );
  }
  return children;
}
