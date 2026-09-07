import { LayoutDashboard, FolderOpen, FileText, MapPin, Package, Users, UserCog } from 'lucide-react';
import { ROUTES } from '@/app/routes';

/**
 * Primary navigation. `adminOnly` entries are hidden from non-admins.
 * `scoped` entries need a selected deployment and are dimmed without one.
 */
export const NAV_ITEMS = Object.freeze([
  { label: 'Dashboard', to: ROUTES.dashboard, icon: LayoutDashboard, end: true, scoped: true },
  { label: 'Sites', to: ROUTES.sites, icon: MapPin, scoped: true },
  { label: 'My Assignments', to: ROUTES.myAssignments, icon: Package, scoped: true },
  { label: 'Deployments', to: ROUTES.deployments, icon: FolderOpen },
  { label: 'Templates', to: ROUTES.templates, icon: FileText },
  { label: 'Members', to: ROUTES.members, icon: Users },
  { label: 'ARES Groups', to: ROUTES.aresGroups, icon: UserCog, adminOnly: true },
]);
