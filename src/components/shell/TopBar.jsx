import React from 'react';
import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { MobileNav } from './MobileNav';
import { DeploymentSwitcher } from './DeploymentSwitcher';
import { ConnectivityBadge } from './ConnectivityBadge';
import { UserMenu } from './UserMenu';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { ROUTES } from '@/app/routes';

/** @param {{ isAdmin: boolean, hasDeployment: boolean, version?: string }} props */
export function TopBar({ isAdmin, hasDeployment, version }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-4">
      <MobileNav isAdmin={isAdmin} hasDeployment={hasDeployment} version={version} />
      <Link to={ROUTES.dashboard} className="lg:hidden" aria-label="Home">
        <Brand compact />
      </Link>
      <div className="hidden sm:block">
        <DeploymentSwitcher />
      </div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <ConnectivityBadge />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
