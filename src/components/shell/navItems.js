import { LayoutDashboard, FolderOpen, FileText, MapPin, Package, Users, UserCog, ClipboardList, Radio, BookOpen, Antenna, Headphones, Clock, ClipboardCheck, ListChecks, Target, Boxes, ShieldCheck } from 'lucide-react';
import { ROUTES } from '@/app/routes';

/**
 * Primary navigation. `adminOnly` entries are hidden from non-admins.
 * `scoped` entries need a selected deployment and are dimmed without one.
 * Order: the operator's own packet first, then the planning sequence
 * (deployment → staffing → comms → sites), then personal and organisation
 * pages.
 */
export const NAV_ITEMS = Object.freeze([
  { label: 'Dashboard', to: ROUTES.dashboard, icon: LayoutDashboard, end: true, scoped: true },
  { label: 'My packet', to: ROUTES.packet, icon: BookOpen, scoped: true },
  { label: 'Deployments', to: ROUTES.deployments, icon: FolderOpen },
  { label: 'Readiness', to: ROUTES.readiness, icon: ListChecks, scoped: true },
  { label: 'Staffing', to: ROUTES.staffing, icon: ClipboardList, scoped: true },
  { label: 'Comms plan', to: ROUTES.comms, icon: Radio, scoped: true },
  { label: 'Net control', to: ROUTES.ncs, icon: Headphones, scoped: true },
  { label: 'Objectives', to: ROUTES.objectives, icon: Target, scoped: true },
  { label: 'Sites', to: ROUTES.sites, icon: MapPin, scoped: true },
  { label: 'My Assignments', to: ROUTES.myAssignments, icon: Package, scoped: true },
  { label: 'Safety', to: ROUTES.safety, icon: ShieldCheck, scoped: true },
  { label: 'After action', to: ROUTES.aar, icon: ClipboardCheck, scoped: true },
  { label: 'Channels', to: ROUTES.channels, icon: Antenna },
  { label: 'Assets', to: ROUTES.assets, icon: Boxes },
  { label: 'Templates', to: ROUTES.templates, icon: FileText },
  { label: 'Members', to: ROUTES.members, icon: Users },
  { label: 'Hours', to: ROUTES.hours, icon: Clock },
  { label: 'ARES Groups', to: ROUTES.aresGroups, icon: UserCog, adminOnly: true },
]);
