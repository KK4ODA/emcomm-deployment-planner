import React from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './navItems';
import { Brand } from './Brand';
import { Hint } from '@/components/ui/tooltip';

/**
 * Desktop navigation rail. Dark in both themes so it reads as the fixed
 * "chassis" of the application.
 * @param {{ isAdmin: boolean, hasDeployment: boolean, collapsed: boolean, onToggle: () => void, version?: string }} props
 */
export function Sidebar({ isAdmin, hasDeployment, collapsed, onToggle, version }) {
  const items = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  return (
    <aside
      className={cn(
        'hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
      aria-label="Primary"
    >
      <div className={cn('flex h-14 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Brand compact={collapsed} light />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map(({ label, to, icon: Icon, end, scoped }) => {
          const link = (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_hsl(var(--sidebar-primary))]' : 'text-sidebar-foreground',
                  scoped && !hasDeployment && 'opacity-60',
                  collapsed && 'justify-center px-0',
                )
              }
            >
              <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );
          return collapsed ? <Hint key={to} label={label} side="right">{link}</Hint> : link;
        })}
      </nav>

      <div className={cn('border-t border-sidebar-border p-2', collapsed ? 'flex justify-center' : 'flex items-center justify-between px-3')}>
        {!collapsed && version && <span className="font-mono text-[10px] text-sidebar-foreground/60">v{version}</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
