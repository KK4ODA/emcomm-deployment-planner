import React from 'react';
import { MapPin, Clock, Radio, Navigation, Phone, User, Package, AlertTriangle, Info, Printer, Check, ParkingCircle, DoorOpen, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CallSign } from '@/components/common/CallSign';
import { channelSummary, CONDITIONS, PATH_ROLES } from '@/lib/comms';
import { requirementLabel } from '@/lib/capabilities';
import { directionsUrl } from '@/lib/packet';
import { formatDateTime } from '@/lib/time';
import { openExternal } from '@/lib/platform';
import { cn } from '@/lib/utils';

const ROLE_VARIANT = { primary: 'success', alternate: 'info', contingency: 'warning', emergency: 'critical' };

/**
 * The operator packet, phone-first. Above the fold: where, when, my call,
 * primary frequency. Two primary actions at most. Prints on one page.
 * @param {{ packet: ReturnType<import('@/lib/packet').buildPacket>, asOf?: Date|null, onAcknowledge?: () => void, acknowledging?: boolean, actions?: React.ReactNode, statusLine?: React.ReactNode, map?: React.ReactNode, coverageAction?: React.ReactNode }} props
 */
export function PacketView({ packet, asOf = null, onAcknowledge, acknowledging, actions, statusLine, map = null, coverageAction = null }) {
  const p = packet;
  const dir = directionsUrl(p.site);
  const primary = p.primaryChannel;
  return (
    <article className="packet mx-auto max-w-2xl space-y-4 text-[17px] leading-snug print:max-w-none print:space-y-2 print:text-[11pt]">
      {p.hasUnseenChange && (
        <div role="alert" className="no-print flex items-start gap-3 rounded-lg border border-warning bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">The plan changed (v{p.version})</p>
            <p className="text-sm">{p.changeNote || 'Check your time, place and frequencies below.'}</p>
          </div>
          {onAcknowledge && <Button size="sm" onClick={onAcknowledge} loading={acknowledging}><Check /> Got it</Button>}
        </div>
      )}

      <header className="rounded-xl border bg-card p-4 shadow-sm print:border-2 print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.deployment.name}{p.deployment.servedAgency ? ` · for ${p.deployment.servedAgency}` : ''}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight print:text-xl">{p.position.name}</h1>
        {p.position.tactical && (
          <p className="mt-2 text-sm text-muted-foreground">Your call for the day</p>
        )}
        {p.position.tactical && <p className="font-mono text-3xl font-bold tracking-wide text-primary print:text-2xl">{p.position.tactical}</p>}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact icon={Clock} label={p.shift.musterAt ? 'Report at' : 'Start'} value={formatDateTime(p.shift.musterAt || p.shift.startsAt, 'EEE MMM d · HH:mm')} sub={p.shift.musterAt ? `On duty ${formatDateTime(p.shift.startsAt, 'HH:mm')} – ${formatDateTime(p.shift.endsAt, 'HH:mm')}` : `Until ${formatDateTime(p.shift.endsAt, 'HH:mm')}`} />
          <Fact icon={MapPin} label="Where" value={p.site?.name || 'Mobile / as directed'} sub={p.site?.address || undefined} />
          {primary && <Fact icon={Radio} label={`Primary${p.position.net ? ` · ${p.position.net} net` : ''}`} value={<span className="font-mono">{channelSummary(primary)}</span>} sub={primary.channel_name} />}
          {p.supervisor && <Fact icon={User} label="Report to" value={p.supervisor.tactical || p.supervisor.name} sub={p.supervisor.people.map(x => x.callSign || x.name).filter(Boolean).join(', ') || undefined} />}
        </dl>

        {map && <div className="mt-4">{map}</div>}

        {(actions || dir) && (
          <div className="no-print mt-4 grid grid-cols-2 gap-2">
            {actions}
            {dir && <Button size="lg" variant="outline" className="h-12 text-base" onClick={() => openExternal(dir)}><Navigation /> Directions</Button>}
          </div>
        )}
        {statusLine && <p className="no-print mt-2 text-sm text-muted-foreground">{statusLine}</p>}
      </header>

      {p.site && (p.site.parking || p.site.arrival || p.site.access || p.site.contact) && (
        <Block title="Getting there" icon={MapPin}>
          {p.site.parking && <Line icon={ParkingCircle} label="Parking" text={p.site.parking} />}
          {p.site.arrival && <Line icon={DoorOpen} label="On arrival" text={p.site.arrival} />}
          {p.site.access && <Line icon={KeyRound} label="Access" text={p.site.access} />}
          {p.site.contact && <Line icon={User} label="Site contact" text={<CallSign value={p.site.contact} />} />}
        </Block>
      )}

      <Block title="Frequencies" icon={Radio}>
        {[1, 2, 3].map(level => {
          const rows = p.channelsByCondition[level] ?? [];
          if (!rows.length) return null;
          const c = CONDITIONS[level];
          return (
            <div key={level} className="mb-3 last:mb-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}: {c.title}{level > 1 ? ` · ${c.hint}` : ''}</p>
              <ul className="divide-y rounded-md border">
                {rows.map(r => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <Badge variant={ROLE_VARIANT[r.path_role] || 'outline'} className="print:border">{PATH_ROLES[r.path_role]?.label || r.path_role}</Badge>
                    <span className="font-mono text-base font-semibold">{channelSummary(r)}</span>
                    <span className="text-sm text-muted-foreground">{r.channel_name}{r.net ? ` · ${r.net} net` : ''}{r.assignment ? ` · ${r.assignment}` : ''}</span>
                    {r.remarks && <span className="basis-full text-sm text-muted-foreground">{r.remarks}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!p.channelsByCondition[1]?.length && !p.channelsByCondition[2]?.length && !p.channelsByCondition[3]?.length && (
          <p className="text-sm text-muted-foreground">No frequencies published yet. Ask net control before the event.</p>
        )}
        {coverageAction && <div className="no-print mt-3">{coverageAction}</div>}
      </Block>

      {(p.position.briefing || p.shift.notes) && (
        <Block title="Your job" icon={Info}>
          {p.position.briefing && <p className="whitespace-pre-line">{p.position.briefing}</p>}
          {p.shift.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{p.shift.notes}</p>}
        </Block>
      )}

      {(p.requirements.length > 0 || p.equipment.length > 0) && (
        <Block title="Bring" icon={Package}>
          {p.requirements.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {p.requirements.map((r, i) => <li key={i}><Badge variant="outline">{requirementLabel(r, false)}</Badge></li>)}
            </ul>
          )}
          {p.equipment.length > 0 && (
            <ul className="space-y-1 text-base">
              {p.equipment.map(i => <li key={i.id} className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded-sm border print:border-black" aria-hidden /> {i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</li>)}
            </ul>
          )}
        </Block>
      )}

      {(p.netControl.length > 0 || p.supervisor?.people?.length) && (
        <Block title="People" icon={Phone}>
          {p.supervisor?.people?.map((x, i) => <Contact key={`s${i}`} role={`Reports to (${p.supervisor.tactical || p.supervisor.name})`} c={x} />)}
          {p.netControl.map((x, i) => <Contact key={`n${i}`} role="Net control" c={x} />)}
        </Block>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Plan v{p.version}{p.publishedAt ? ` · published ${formatDateTime(p.publishedAt)}` : ' · not yet published'}{asOf ? ` · as of ${formatDateTime(asOf, 'HH:mm')}` : ''}</span>
        <button type="button" onClick={() => window.print()} className="no-print inline-flex items-center gap-1 hover:text-foreground"><Printer className="h-3.5 w-3.5" /> Print</button>
      </footer>
    </article>
  );
}

function Fact({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary print:hidden"><Icon className="h-4 w-4" aria-hidden /></div>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-lg font-semibold leading-tight print:text-base">{value}</dd>
        {sub && <dd className="text-sm text-muted-foreground">{sub}</dd>}
      </div>
    </div>
  );
}

/** @param {{ title: string, icon: React.ElementType, children: React.ReactNode, className?: string }} props */
function Block({ title, icon: Icon, children, className }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 shadow-sm print:break-inside-avoid print:border print:p-2 print:shadow-none', className)}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" aria-hidden /> {title}</h2>
      {children}
    </section>
  );
}

function Line({ icon: Icon, label, text }) {
  return (
    <div className="mb-2 flex items-start gap-2 last:mb-0">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><div className="whitespace-pre-line">{text}</div></div>
    </div>
  );
}

function Contact({ role, c }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 last:mb-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{role}</span>
      {c.callSign && <CallSign value={c.callSign} size="md" />}
      {c.name && <span>{c.name}</span>}
      {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 font-mono text-primary underline-offset-4 hover:underline"><Phone className="h-3.5 w-3.5" /> {c.phone}</a>}
    </div>
  );
}
