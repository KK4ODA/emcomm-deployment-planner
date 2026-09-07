import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { DEPLOYMENT_STATUS } from '@/lib/constants';
import { ROUTES } from '@/app/routes';
import { cn } from '@/lib/utils';

const MANAGE = '__manage__';

/** Header control that changes the active deployment for the whole app. */
/** @param {{ className?: string, dark?: boolean }} props */
export function DeploymentSwitcher({ className, dark = false }) {
  const { deploymentId, deployments, selectDeployment, status } = useCurrentDeployment();
  const navigate = useNavigate();

  if (!deployments.length) return null;

  const handleChange = (value) => {
    if (value === MANAGE) { navigate(ROUTES.deployments); return; }
    selectDeployment(value);
  };

  const value = status === 'ready' ? deploymentId : '';
  // Archived deployments stay out of the switcher unless one is currently open.
  const options = deployments.filter(d => d.status !== 'archived' || d.id === deploymentId);
  const hidden = deployments.length - options.length;

  return (
    <Select value={value ?? ''} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Active deployment"
        className={cn('h-8 w-full sm:w-56 text-xs font-medium', dark && 'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground', className)}
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <SelectValue placeholder="Select deployment" />
      </SelectTrigger>
      <SelectContent>
        {options.map(d => (
          <SelectItem key={d.id} value={d.id}>
            <span className="flex items-center gap-2">
              <span className="truncate">{d.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{DEPLOYMENT_STATUS[d.status]?.label ?? d.status}</span>
            </span>
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={MANAGE}>{hidden > 0 ? `Manage deployments… (${hidden} archived)` : 'Manage deployments…'}</SelectItem>
      </SelectContent>
    </Select>
  );
}
