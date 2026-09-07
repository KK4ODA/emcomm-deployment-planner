import React, { useState } from 'react';
import { toast } from 'sonner';
import { Bug, BookOpen, Download, ExternalLink, FileText, Github, RefreshCw, Monitor, Globe, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isDesktopApp, openExternal, platformLabel } from '@/lib/platform';
import { APP_NAME } from '@/lib/constants';
import {
  APP_VERSION, UPDATE_CHANNEL, COPYRIGHT, REPO_URL, LATEST_RELEASE_URL, ISSUES_URL, DOCS_URL, CHANGELOG_URL,
  releaseNotesUrl, isPrerelease,
} from '@/lib/appInfo';
import { requestUpdateCheck } from '@/features/desktop/DesktopUpdater';

const PLATFORM = {
  desktop: { label: 'Windows desktop app', icon: Monitor, help: 'Updates are downloaded from GitHub Releases and verified before installing.' },
  pwa: { label: 'Installed web app (PWA)', icon: Smartphone, help: 'New versions are picked up when the site is redeployed; a reload banner appears.' },
  web: { label: 'Web browser', icon: Globe, help: 'Install this site as an app from the browser menu for offline use.' },
};

/**
 * "About" tab on the profile page: build facts, update status and the links a
 * member needs when something goes wrong (release notes, issue tracker, docs).
 */
export function AboutPanel() {
  const platform = platformLabel();
  const info = PLATFORM[platform] || PLATFORM.web;
  const PlatformIcon = info.icon;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{APP_NAME}</CardTitle>
          <CardDescription>Deployment planning for ARES emergency communications groups.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="flex items-center gap-2 font-mono">
              {APP_VERSION}
              {isPrerelease() && <Badge variant="warning">pre-release</Badge>}
            </dd>
            <dt className="text-muted-foreground">Update channel</dt>
            <dd className="capitalize">{UPDATE_CHANNEL}</dd>
            <dt className="text-muted-foreground">Running as</dt>
            <dd className="flex items-center gap-1.5"><PlatformIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{info.label}</dd>
            <dt className="text-muted-foreground">Publisher</dt>
            <dd>{COPYRIGHT}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">{info.help}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {isDesktopApp() ? (
              <CheckForUpdatesButton />
            ) : (
              <Button size="sm" variant="outline" onClick={() => openExternal(LATEST_RELEASE_URL)}>
                <Download /> Get the desktop app
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => openExternal(releaseNotesUrl())}>
              <FileText /> What's new in {APP_VERSION}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Help and resources</CardTitle>
          <CardDescription>Everything opens in your browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            <ResourceLink icon={Bug} href={ISSUES_URL} title="Report a problem or request a feature" detail="GitHub issue tracker" />
            <ResourceLink icon={BookOpen} href={DOCS_URL} title="Documentation" detail="Architecture, offline behaviour, backend, releases" />
            <ResourceLink icon={FileText} href={CHANGELOG_URL} title="Change log" detail="All versions" />
            <ResourceLink icon={Github} href={REPO_URL} title="Source code" detail="KK4ODA/emcomm-deployment-planner" />
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Works offline for viewing cached deployments and for creating or completing tasks; changes sync
            when a connection returns. Map data © OpenStreetMap contributors and Esri.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ResourceLink({ icon: Icon, href, title, detail }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => openExternal(href)}
        className="flex w-full items-center gap-3 py-2.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

function CheckForUpdatesButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const result = await requestUpdateCheck();
      if (result === 'none') toast.success(`You are on the latest version (${APP_VERSION}).`);
      // 'available' shows the update banner itself.
    } catch (err) {
      toast.error('Could not check for updates', { description: err?.message || 'GitHub is unreachable. Try again when online.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={run} loading={busy}>
      <RefreshCw /> Check for updates
    </Button>
  );
}
