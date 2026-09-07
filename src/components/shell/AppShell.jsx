import React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineBanner } from './OfflineBanner';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { STORAGE_KEYS } from '@/lib/constants';
import { RequireAresGroup } from '@/features/auth/RequireAresGroup';
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt';
import { DesktopUpdater } from '@/features/desktop/DesktopUpdater';
import { cn } from '@/lib/utils';

const VERSION = import.meta.env.VITE_APP_VERSION;

/** Application chrome: sidebar (desktop), top bar, banners, and the page area. */
export function AppShell({ children }) {
  const { user } = useAuth();
  const { status } = useCurrentDeployment();
  const [collapsed, setCollapsed] = useLocalStorage(STORAGE_KEYS.sidebarCollapsed, false);
  const isAdmin = user?.app_role === 'admin';
  const hasDeployment = status === 'ready';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-dvh bg-background">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow">
          Skip to content
        </a>
        <Sidebar isAdmin={isAdmin} hasDeployment={hasDeployment} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} version={VERSION} />
        <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
          <TopBar isAdmin={isAdmin} hasDeployment={hasDeployment} version={VERSION} />
          <OfflineBanner />
          <main id="main" className="flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
            <div className="mx-auto w-full max-w-[1400px] animate-fade-in">{children}</div>
          </main>
        </div>
        <RequireAresGroup />
        <UpdatePrompt />
        <DesktopUpdater />
      </div>
    </TooltipProvider>
  );
}
