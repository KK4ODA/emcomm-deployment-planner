import React, { useEffect, useState } from 'react';
import { RadioTower } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { COVERAGE_RESULTS } from '@/lib/coverage';
import { channelSummary } from '@/lib/comms';
import { cn } from '@/lib/utils';

const NONE = '__none__';
const CUSTOM = '__custom__';

/**
 * Record one path attempt: which channel, did it work, from where to where.
 * From the packet the ends are prefilled (my site to net control); from the
 * Sites map both ends are chosen.
 * @param {{
 *   open: boolean, onClose: () => void,
 *   channels?: Object[], sites?: Object[],
 *   defaultFromSiteId?: string|null, defaultToSiteId?: string|null, defaultToLabel?: string|null,
 *   lockEnds?: boolean,
 *   onSubmit: (data: { channel_name: string|null, frequency_mhz: number|null, mode: string|null, result: string, power_w: number|null, antenna: string|null, notes: string|null, from_site_id: string|null, to_site_id: string|null, to_label: string|null }) => void,
 *   submitting?: boolean
 * }} props
 */
export function CoverageReportDialog({ open, onClose, channels = [], sites = [], defaultFromSiteId = null, defaultToSiteId = null, defaultToLabel = null, lockEnds = false, onSubmit, submitting }) {
  const [channelId, setChannelId] = useState('');
  const [custom, setCustom] = useState({ name: '', freq: '' });
  const [result, setResult] = useState('');
  const [power, setPower] = useState('');
  const [antenna, setAntenna] = useState('');
  const [notes, setNotes] = useState('');
  const [fromSite, setFromSite] = useState('');
  const [toSite, setToSite] = useState('');
  useEffect(() => {
    if (!open) return;
    setChannelId(channels[0]?.id ? String(channels[0].id) : CUSTOM);
    setCustom({ name: '', freq: '' }); setResult(''); setPower(''); setAntenna(''); setNotes('');
    setFromSite(defaultFromSiteId || ''); setToSite(defaultToSiteId || '');
  }, [open, channels, defaultFromSiteId, defaultToSiteId]);

  const chosen = channels.find(c => String(c.id) === channelId) || null;
  const ok = !!result && (chosen || custom.name.trim() || custom.freq.trim());
  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    onSubmit({
      channel_name: chosen ? chosen.channel_name || chosen.name || null : custom.name.trim() || null,
      frequency_mhz: chosen ? (chosen.rx_freq != null && chosen.rx_freq !== '' ? Number(chosen.rx_freq) : null) : (custom.freq.trim() ? Number(custom.freq) : null),
      mode: chosen ? (chosen.mode === 'D' ? 'digital' : 'FM') : null,
      result,
      power_w: power.trim() ? Number(power) : null,
      antenna: antenna.trim() || null,
      notes: notes.trim() || null,
      from_site_id: fromSite || null,
      to_site_id: toSite || null,
      to_label: toSite ? null : defaultToLabel,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RadioTower className="h-5 w-5" /> Coverage check</DialogTitle>
          <DialogDescription>Ten seconds. Over time these build the group's real coverage map, which beats any prediction.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Channel" required>
            {({ id }) => (
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger id={id}><SelectValue placeholder="Pick a channel" /></SelectTrigger>
                <SelectContent>
                  {channels.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.channel_name || c.name} · {channelSummary(c)}</SelectItem>)}
                  <SelectItem value={CUSTOM}>Other…</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          {channelId === CUSTOM && (
            <div className="grid grid-cols-2 gap-2">
              <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Channel or repeater" aria-label="Channel name" />
              <Input value={custom.freq} onChange={(e) => setCustom({ ...custom, freq: e.target.value })} placeholder="MHz" inputMode="decimal" aria-label="Frequency MHz" className="font-mono" />
            </div>
          )}
          <div>
            <p className="mb-1 text-sm font-medium">Result</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Result">
              {Object.entries(COVERAGE_RESULTS).map(([k, r]) => (
                <Button key={k} type="button" role="radio" aria-checked={result === k} variant={result === k ? 'default' : 'outline'} className={cn('h-11', result === k && k === 'fail' && 'bg-destructive hover:bg-destructive/90', result === k && k === 'relay' && 'bg-warning text-warning-foreground hover:bg-warning/90')} onClick={() => setResult(k)}>{r.label}</Button>
              ))}
            </div>
          </div>
          {!lockEnds && sites.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <FormField label="From">
                {({ id }) => (
                  <Select value={fromSite || NONE} onValueChange={(v) => setFromSite(v === NONE ? '' : v)}>
                    <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>Not a listed site</SelectItem>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField label="To">
                {({ id }) => (
                  <Select value={toSite || NONE} onValueChange={(v) => setToSite(v === NONE ? '' : v)}>
                    <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>{defaultToLabel || 'Not a listed site'}</SelectItem>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Power (W)" hint="Optional">{({ id }) => <Input id={id} value={power} onChange={(e) => setPower(e.target.value)} inputMode="decimal" placeholder="5" />}</FormField>
            <FormField label="Antenna" hint="Optional">{({ id }) => <Input id={id} value={antenna} onChange={(e) => setAntenna(e.target.value)} placeholder="rubber duck, mag mount, J-pole" />}</FormField>
          </div>
          <FormField label="Note" hint="Optional: scratchy, only from the parking deck, worked after moving 20 m">
            {({ id }) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={!ok}>Record</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
