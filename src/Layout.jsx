import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { Radio, User, Menu, LayoutDashboard, Users, Package, LogOut, Settings, FolderOpen, MapPin, FileText, UserCog } from "lucide-react";
import { OfflineProvider } from '@/components/OfflineProvider';
import OfflineIndicator from '@/components/OfflineIndicator';
import NotificationBell from '@/components/NotificationBell';
import CookieBanner from '@/components/CookieBanner';
import RequireAresGroup from '@/components/RequireAresGroup';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentDeploymentId, setCurrentDeploymentId] = useState(
    localStorage.getItem('currentDeploymentId') || null
  );

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => base44.entities.Deployment.list('-created_date')
  });

  const { data: currentDeployment } = useQuery({
    queryKey: ['deployment', currentDeploymentId],
    queryFn: () => currentDeploymentId ? base44.entities.Deployment.filter({ id: currentDeploymentId }).then(d => d[0]) : null,
    enabled: !!currentDeploymentId
  });

  const handleDeploymentChange = (deploymentId) => {
    localStorage.setItem('currentDeploymentId', deploymentId);
    setCurrentDeploymentId(deploymentId);
    window.location.reload();
  };

  const isAdmin = user?.app_role === 'admin';

  const navItems = [
    { name: 'Deployments', icon: FolderOpen, page: 'Deployments' },
    { name: 'Templates', icon: FileText, page: 'Templates' },
    { name: 'Locations', icon: MapPin, page: 'Locations' },
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'My Items', icon: Package, page: 'MyAssignments' },
    { name: 'Members', icon: Users, page: 'Members' },
    ...(isAdmin ? [{ name: 'ARES Groups', icon: UserCog, page: 'ARESGroups' }] : []),
  ];

  return (
    <OfflineProvider>
      <RequireAresGroup user={user} onComplete={() => window.location.reload()} />
      <div className="min-h-screen bg-slate-50">
        <OfflineIndicator />
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 rounded-lg">
                <Radio className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-slate-900 hidden sm:block">EmComm Planner</span>
            </Link>

            {/* Deployment Selector */}
            {currentPageName !== 'Deployments' && deployments.length > 0 && (
              <div className="hidden md:block">
                <Select value={currentDeploymentId || ''} onValueChange={handleDeploymentChange}>
                  <SelectTrigger className="w-48 bg-white">
                    <SelectValue placeholder="Select deployment" />
                  </SelectTrigger>
                  <SelectContent>
                    {deployments.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPageName === item.page
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-2">
              <NotificationBell user={user} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-slate-800 to-slate-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {user?.full_name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <span className="hidden sm:block text-sm font-medium text-slate-700">
                      {user?.call_sign || user?.full_name || 'User'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="font-medium text-slate-900">{user?.full_name}</p>
                    <p className="text-sm text-slate-500">{user?.email}</p>
                    {user?.call_sign && (
                      <p className="text-sm font-mono text-slate-600 mt-1 flex items-center gap-1">
                        <Radio className="h-3 w-3" />
                        {user.call_sign}
                      </p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl('Profile')} className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      Profile Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => base44.auth.logout()}
                    className="text-rose-600 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map(item => (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    currentPageName === item.page
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

        {/* Main Content */}
        <main>
          {children}
        </main>

        {/* Cookie Banner */}
        <CookieBanner />
        </div>
        </OfflineProvider>
        );
        }