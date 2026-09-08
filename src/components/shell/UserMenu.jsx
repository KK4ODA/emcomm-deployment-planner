import React from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Settings, ChevronDown, Info, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/common/UserAvatar';
import { CallSign } from '@/components/common/CallSign';
import { RoleBadge } from '@/components/common/Badges';
import { ThemeMenuItems } from './ThemeToggle';
import { TextSizeMenuItems } from './TextSizeMenuItems';
import { useAuth } from '@/lib/AuthContext';
import { ROUTES } from '@/app/routes';

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Account menu">
          <UserAvatar user={user} size="sm" />
          <span className="hidden max-w-[10rem] truncate text-sm font-medium md:inline">
            {user.call_sign || user.full_name || 'Account'}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:inline" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <UserAvatar user={user} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.full_name || 'Unnamed member'}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex items-center gap-1.5">
              {user.call_sign && <CallSign value={user.call_sign} icon />}
              <RoleBadge role={user.app_role} />
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={ROUTES.profile}><Settings /> Profile &amp; settings</Link>
        </DropdownMenuItem>
        <ThemeMenuItems />
        <TextSizeMenuItems />
        <DropdownMenuItem asChild>
          <Link to={ROUTES.guide}><BookOpen /> User guide</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={ROUTES.about}><Info /> About EmComm Planner</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
