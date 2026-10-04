import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Clock, Radio, AlertTriangle, ExternalLink, Printer } from 'lucide-react';
import { Brand } from '@/components/shell/Brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/app/routes';
import { formatDateTime } from '@/lib/time';
import { openExternal } from '@/lib/platform';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/public-plan`;

/**
 * The plan as a partner agency sees it: no account, no editing, no personal
 * contact details unless the planner chose to include them. Answers the
 * question that reached the UASI net at one in the morning, which was simply
 * where the site is.
 */
export default function SharedPlan() {
  const { token } = useParams();
  const [state, setState] = useState(/** @type {{ status: 'loading'|'ok'|'gone'|'error', data?: any, error?: string }} */ ({ status: 'loading' }));

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}?t=${encodeURIComponent(token || '')}`);
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok && !body.error) setState({ status: 'ok', data: body });
        else setState({ status: body.error === 'not_found' || res.status === 404 ? 'gone' : 'error', error: body.error || `HTTP ${res.status}` });
      } catch (err) {
        if (live) setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { live = false; };
  }, [token]);

  if (state.status === 'loading') return <Shell><p className="text-sm text-muted-foreground">Loading the plan…</p></Shell>;
  if (state.status === 'gone') return (
    <Shell>
      <h1 className="text-xl font-semibold">This link is no longer live</h1>
      <p className="mt-2 text-sm text-muted-foreground">It was revoked or it expired. Ask whoever sent it for a new one.</p>
    </Shell>
  );
  if (state.status === 'error') return (
    <Shell>
      <h1 className="text-xl font-semibold">Could not load the plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">{state.error}</p>
    </Shell>
  );

  const { deployment: d, sites = [], units = [], periods = [], include_contacts: contacts } = state.data;
  const mapsHref = (site) => (site.lat != null && site.lon != null
    ? `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address || site.name)}`);

  return (
    <Shell>
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.served_agency || 'Deployment plan'}</p>
        <h1 className="text-2xl font-bold tracking-tight">{d.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(d.starts_at) || 'Time to be set'}{d.ends_at ? ` to ${formatDateTime(d.ends_at)}` : ''}</span>
          {d.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {d.location}</span>}
          <Badge variant="outline">{String(d.status || '').replace('_', ' ')}</Badge>
        </p>
        {d.description && <p className="mt-2 max-w-prose text-sm">{d.description}</p>}
      </div>

      {d.registration_required && (
        <p className="mb-5 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>Registration with the host is required to attend.{d.registration_notes ? ` ${d.registration_notes}` : ''}</span>
        </p>
      )}

      {periods.length > 0 && (
        <Block title="Operational periods">
          <ul className="space-y-1 text-sm">
            {periods.map((p, i) => <li key={i}><span className="font-medium">{p.label || `Period ${i + 1}`}</span> <span className="text-muted-foreground">{formatDateTime(p.starts_at)} to {formatDateTime(p.ends_at)}</span></li>)}
          </ul>
        </Block>
      )}

      <Block title={`Sites (${sites.length})`}>
        <ul className="space-y-3">
          {sites.map((s, i) => (
            <li key={i} className="rounded-md border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{s.name}</h3>
                {s.site_type && <Badge variant="outline">{String(s.site_type).replace('_', ' ')}</Badge>}
              </div>
              {s.address && <p className="mt-0.5 text-sm text-muted-foreground">{s.address}</p>}
              {s.arrival_notes && <p className="mt-1 text-sm"><span className="font-medium">Arrival: </span>{s.arrival_notes}</p>}
              {s.parking_notes && <p className="text-sm"><span className="font-medium">Parking: </span>{s.parking_notes}</p>}
              {contacts && s.contact_person && <p className="text-sm"><span className="font-medium">Contact: </span>{s.contact_person}</p>}
              {(s.address || (s.lat != null && s.lon != null)) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => openExternal(mapsHref(s))}>
                  <MapPin /> Directions <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
          {sites.length === 0 && <li className="text-sm text-muted-foreground">No sites listed yet.</li>}
        </ul>
      </Block>

      {units.length > 0 && (
        <Block title={`Units (${units.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-1 pr-3">Tactical</th><th className="py-1 pr-3">Position</th><th className="py-1 pr-3">Site</th><th className="py-1 pr-3">Net</th>{contacts && <th className="py-1">Lead</th>}</tr>
              </thead>
              <tbody className="divide-y">
                {units.map((u, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 font-mono font-medium">{u.tactical_callsign || '—'}</td>
                    <td className="py-1.5 pr-3">{u.name}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{u.site || 'Mobile'}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{u.net || ''}</td>
                    {contacts && <td className="py-1.5 font-mono text-xs">{u.leader || ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {units.some(u => u.winlink_address) && (
            <p className="mt-3 text-xs text-muted-foreground">
              <Radio className="mr-1 inline h-3 w-3" />
              Written traffic: {units.filter(u => u.winlink_address).map(u => `${u.tactical_callsign || u.name} ${u.winlink_address}`).join(' · ')}
            </p>
          )}
        </Block>
      )}

      {d.map_url && (
        <Button variant="outline" onClick={() => openExternal(d.map_url)}><MapPin /> Event map <ExternalLink className="h-3 w-3" /></Button>
      )}

      <p className="mt-8 border-t pt-3 text-xs text-muted-foreground">
        Read-only view{d.plan_published_at ? ` of plan version ${d.plan_version || 1}, published ${formatDateTime(d.plan_published_at)}` : ''}. Shared by the deployment&apos;s planners; it can be revoked at any time.
      </p>
    </Shell>
  );
}

/** @param {{ title: string, children: React.ReactNode }} props */
function Block({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** @param {{ children: React.ReactNode }} props */
function Shell({ children }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="no-print sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.print()} className="hidden sm:inline-flex"><Printer /> Print</Button>
            <Button asChild size="sm" variant="outline"><Link to={ROUTES.login}>Sign in</Link></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
