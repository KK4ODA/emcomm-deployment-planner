import React from 'react';
import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './navItems';
import { Brand } from './Brand';
import { DeploymentSwitcher } from './DeploymentSwitcher';

/** Hamburger + slide-out drawer for screens below lg. */
export function MobileNav({ isAdmin, hasDeployment, version }) {
  const [open, setOpen] = React.useState(false);
  const items = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" title="Navigation" className="flex flex-col bg-sidebar p-0 text-sidebar-foreground border-sidebar-border">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Brand light />
        </div>
        <div className="border-b border-sidebar-border p-3">
          <DeploymentSwitcher dark />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map(({ label, to, icon: Icon, end, scoped }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60',
                  scoped && !hasDeployment && 'opacity-60',
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        {version && <p className="border-t border-sidebar-border px-4 py-2 font-mono text-[10px] text-sidebar-foreground/60">v{version}</p>}
      </SheetContent>
    </Sheet>
  );
}
