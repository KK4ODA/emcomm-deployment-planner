import React from 'react';
import { Shield, Settings2, Eye, Clock, CheckCircle2, Play, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEPLOYMENT_STATUS, TASK_STATUS, TASK_PRIORITY, ITEM_PRIORITY } from '@/lib/constants';
import { ROLES, getRoleLabel } from '@/lib/permissions';
import { ASSIGNMENT_STATUS } from '@/lib/staffing';

const toneToVariant = { info: 'info', success: 'success', warning: 'warning', critical: 'critical', neutral: 'secondary', muted: 'muted' };

/** @param {Record<string, {label: string, tone: string}>} map @param {string} [value] @param {string} [className] */
function toneBadge(map, value, className) {
  const meta = map[value];
  if (!meta) return value ? <Badge variant="outline" className={className}>{value}</Badge> : null;
  return <Badge variant={toneToVariant[meta.tone] || 'outline'} className={className}>{meta.label}</Badge>;
}

/** @param {{ status?: string, className?: string }} props */
export const DeploymentStatusBadge = ({ status, className }) => toneBadge(DEPLOYMENT_STATUS, status, className);
/** @param {{ priority?: string, className?: string }} props */
export const TaskPriorityBadge = ({ priority, className }) => toneBadge(TASK_PRIORITY, priority, className);
/** @param {{ priority?: string, className?: string }} props */
export const ItemPriorityBadge = ({ priority, className }) => toneBadge(ITEM_PRIORITY, priority, className);
/** @param {{ status?: string, className?: string }} props */
export const AssignmentStatusBadge = ({ status, className }) => toneBadge(ASSIGNMENT_STATUS, status, className);

const TASK_ICONS = { pending: Circle, in_progress: Play, completed: CheckCircle2 };

/** @param {{ status?: string, className?: string }} props */
export function TaskStatusBadge({ status, className }) {
  const meta = TASK_STATUS[status];
  const Icon = TASK_ICONS[status] || Clock;
  return (
    <Badge variant={toneToVariant[meta?.tone] || 'outline'} className={className}>
      <Icon className="h-3 w-3" aria-hidden /> {meta?.label || status}
    </Badge>
  );
}

const ROLE_META = {
  [ROLES.ADMIN]: { icon: Shield, variant: 'warning' },
  [ROLES.OPERATOR]: { icon: Settings2, variant: 'info' },
  [ROLES.VIEWER]: { icon: Eye, variant: 'secondary' },
  [ROLES.PENDING]: { icon: Clock, variant: 'accent' },
};

/** @param {{ role?: string, className?: string, [key: string]: any }} props */
export function RoleBadge({ role, className, ...props }) {
  const meta = ROLE_META[role] || { icon: Eye, variant: 'outline' };
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className} {...props}>
      <Icon className="h-3 w-3" aria-hidden /> {getRoleLabel(role)}
    </Badge>
  );
}
