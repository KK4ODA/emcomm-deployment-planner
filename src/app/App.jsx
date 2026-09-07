import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { DeploymentProvider } from '@/contexts/DeploymentContext';
import { OfflineProvider } from '@/contexts/OfflineContext';
import { AppShell } from '@/components/shell/AppShell';
import { FullScreenLoader } from '@/components/common/LoadingState';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ROUTES, LEGACY_REDIRECTS } from './routes';

import Dashboard from '@/pages/Dashboard';
import Deployments from '@/pages/Deployments';
import Templates from '@/pages/Templates';
import Sites from '@/pages/Sites';
import SiteTasks from '@/pages/SiteTasks';
import Staffing from '@/pages/Staffing';
import CommsPlan from '@/pages/CommsPlan';
import Channels from '@/pages/Channels';
import Packet from '@/pages/Packet';
import NcsBoard from '@/pages/NcsBoard';
import Hours from '@/pages/Hours';
import MyAssignments from '@/pages/MyAssignments';
import Members from '@/pages/Members';
import AresGroups from '@/pages/AresGroups';
import Profile from '@/pages/Profile';
import NotFound from '@/pages/NotFound';

const Login = lazy(() => import('@/pages/Login'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

/** Legacy /LocationTasks?location=<id> → /sites/<id>/tasks */
function LegacySiteTasksRedirect() {
  const [params] = useSearchParams();
  const id = params.get('location');
  return <Navigate to={id ? ROUTES.siteTasks(id) : ROUTES.sites} replace />;
}

function RequireAuth({ children }) {
  const { isLoadingAuth, authError, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) return <FullScreenLoader label="Checking your session" />;
  if (!isAuthenticated || authError?.type === 'auth_required') {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }
  return children;
}

function AuthenticatedApp() {
  return (
    <RequireAuth>
      <OfflineProvider>
        <DeploymentProvider>
          <AppShell>
            <ErrorBoundary>
              <Routes>
                <Route path={ROUTES.dashboard} element={<Dashboard />} />
                <Route path={ROUTES.deployments} element={<Deployments />} />
                <Route path={ROUTES.templates} element={<Templates />} />
                <Route path={ROUTES.sites} element={<Sites />} />
                <Route path="/sites/:siteId/tasks" element={<SiteTasks />} />
                <Route path={ROUTES.staffing} element={<Staffing />} />
                <Route path={ROUTES.comms} element={<CommsPlan />} />
                <Route path={ROUTES.channels} element={<Channels />} />
                <Route path={ROUTES.packet} element={<Packet />} />
                <Route path="/packet/:assignmentId" element={<Packet />} />
                <Route path={ROUTES.ncs} element={<NcsBoard />} />
                <Route path={ROUTES.hours} element={<Hours />} />
                <Route path={ROUTES.myAssignments} element={<MyAssignments />} />
                <Route path={ROUTES.members} element={<Members />} />
                <Route path={ROUTES.aresGroups} element={<AresGroups />} />
                <Route path={ROUTES.profile} element={<Profile />} />
                <Route path="/LocationTasks" element={<LegacySiteTasksRedirect />} />
                {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                  <Route key={from} path={from} element={<Navigate to={to} replace />} />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </AppShell>
        </DeploymentProvider>
      </OfflineProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClientInstance}>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<FullScreenLoader />}>
              <Routes>
                <Route path={ROUTES.login} element={<Login />} />
                <Route path="/Login" element={<Navigate to={ROUTES.login} replace />} />
                <Route path={ROUTES.resetPassword} element={<ResetPassword />} />
                <Route path="/*" element={<AuthenticatedApp />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
