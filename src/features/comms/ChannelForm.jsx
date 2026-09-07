import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { CHANNEL_CONFIGS, DIGITAL_MODES, digitalModeLabel, normalizeFrequency, suggestTx, bandOf, frequencyWarning, channelSummary } from '@/lib/comms';

const NONE = '__none__';
const EMPTY = {
  name: '', config: 'repeater', rx_freq: '', tx_freq: '', rx_tone: '', tx_tone: '', bandwidth: '', mode: 'A', digital_mode: '',
  gateway_callsign: '', tactical_address: '', owner_callsign: '', phone_number: '', timeout_seconds: '', eligible_users: '', remarks: '', active: true,
};

/**
 * Library channel editor (ICS-217A fields, plain labels). Frequencies are
 * normalised to four decimals; the transmit frequency is suggested from the
 * standard offset when the receive frequency is typed.
 * @param {{ open: boolean, onClose: () => void, channel?: Object|null, groupId: string, onSubmit: (data: Object) => void, submitting?: boolean }} props
 */
export function ChannelForm({ open, onClose, channel, groupId, onSubmit, submitting }) {
  const [form, setForm] = useState(EMPTY);
  const [txTouched, setTxTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTxTouched(!!channel);
    setForm(channel ? {
      name: channel.name || '', config: channel.config || 'repeater',
      rx_freq: channel.rx_freq != null ? Number(channel.rx_freq).toFixed(4) : '', tx_freq: channel.tx_freq != null ? Number(channel.tx_freq).toFixed(4) : '',
      rx_tone: channel.rx_tone || '', tx_tone: channel.tx_tone || '', bandwidth: channel.tx_bandwidth || channel.rx_bandwidth || '',
      mode: channel.mode || 'A', digital_mode: channel.digital_mode || '', gateway_callsign: channel.gateway_callsign || '',
      tactical_address: channel.tactical_address || '', owner_callsign: channel.owner_callsign || '', phone_number: channel.phone_number || '',
      timeout_seconds: channel.timeout_seconds ?? '', eligible_users: channel.eligible_users || '', remarks: channel.remarks || '', active: channel.active !== false,
    } : EMPTY);
  }, [open, channel]);

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));
  const isPhone = form.config === 'phone';
  const isDigital = form.mode === 'D' || form.config === 'digital';

  const onRxBlur = () => {
    const rx = normalizeFrequency(form.rx_freq);
    const next = { ...form, rx_freq: rx };
    if (rx && (!txTouched || !form.tx_freq)) {
      const tx = form.config === 'repeater' ? suggestTx(rx) : Number(rx);
      next.tx_freq = tx != null ? tx.toFixed(4) : '';
    }
    setForm(next);
  };

  const submit = (e) => {
    e.preventDefault();
    const rx = normalizeFrequency(form.rx_freq);
    const tx = normalizeFrequency(form.tx_freq) || rx;
    onSubmit({
      ares_group_id: groupId,
      name: form.name.trim(),
      config: form.config,
      band: rx ? bandOf(rx) || null : null,
      rx_freq: rx ? Number(rx) : null,
      tx_freq: tx ? Number(tx) : null,
      rx_tone: form.rx_tone.trim() || null,
      tx_tone: form.tx_tone.trim() || null,
      rx_bandwidth: form.bandwidth || null,
      tx_bandwidth: form.bandwidth || null,
      mode: form.mode,
      digital_mode: isDigital ? form.digital_mode || null : null,
      gateway_callsign: form.gateway_callsign.trim().toUpperCase() || null,
      tactical_address: form.tactical_address.trim().toUpperCase() || null,
      owner_callsign: form.owner_callsign.trim().toUpperCase() || null,
      phone_number: form.phone_number.trim() || null,
      timeout_seconds: form.timeout_seconds === '' ? null : Number(form.timeout_seconds),
      eligible_users: form.eligible_users.trim() || null,
      remarks: form.remarks.trim() || null,
      active: form.active,
    });
  };

  const preview = channelSummary({ ...form, rx_freq: normalizeFrequency(form.rx_freq) || null, tx_freq: normalizeFrequency(form.tx_freq) || null });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{channel ? 'Edit channel' : 'New channel'}</DialogTitle>
          <DialogDescription>Enter it once; every deployment picks it from this library. {preview && <span className="font-mono text-foreground">{preview}</span>}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
            <FormField label="Name" required hint="How people say it on the air or in the plan">
              {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. W4DOC 146.82, RACE net, Simplex 146.55" required autoFocus />}
            </FormField>
            <FormField label="Kind">
              {({ id }) => (
                <Select value={form.config} onValueChange={(v) => { set('config')(v); if (v === 'digital') set('mode')('D'); }}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CHANNEL_CONFIGS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          </div>

          {isPhone ? (
            <FormField label="Phone number" required hint="Voice-only all-call numbers, net control phone">
              {({ id }) => <Input id={id} type="tel" value={form.phone_number} onChange={(e) => set('phone_number')(e.target.value)} required />}
            </FormField>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <FormField label="Receive (MHz)" required error={frequencyWarning(normalizeFrequency(form.rx_freq)) || undefined}>
                  {({ id }) => <Input id={id} inputMode="decimal" value={form.rx_freq} onChange={(e) => set('rx_freq')(e.target.value)} onBlur={onRxBlur} placeholder="146.820" className="font-mono" required />}
                </FormField>
                <FormField label="Transmit (MHz)" hint={form.config === 'repeater' ? 'Suggested from the standard offset' : 'Same as receive for simplex'}>
                  {({ id }) => <Input id={id} inputMode="decimal" value={form.tx_freq} onChange={(e) => { setTxTouched(true); set('tx_freq')(e.target.value); }} onBlur={() => set('tx_freq')(normalizeFrequency(form.tx_freq))} placeholder="146.220" className="font-mono" />}
                </FormField>
                <FormField label="TX tone / NAC" hint="PL/CTCSS you send, e.g. 146.2">
                  {({ id }) => <Input id={id} value={form.tx_tone} onChange={(e) => set('tx_tone')(e.target.value)} placeholder="146.2" className="font-mono" />}
                </FormField>
                <FormField label="RX tone" hint="Only if the repeater sends one">
                  {({ id }) => <Input id={id} value={form.rx_tone} onChange={(e) => set('rx_tone')(e.target.value)} className="font-mono" />}
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <FormField label="Mode">
                  {({ id }) => (
                    <Select value={form.mode} onValueChange={set('mode')}>
                      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="A">Analog</SelectItem><SelectItem value="D">Digital</SelectItem><SelectItem value="M">Mixed</SelectItem></SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField label="Bandwidth">
                  {({ id }) => (
                    <Select value={form.bandwidth || NONE} onValueChange={(v) => set('bandwidth')(v === NONE ? '' : v)}>
                      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={NONE}>Not specified</SelectItem><SelectItem value="W">Wide (25 kHz)</SelectItem><SelectItem value="N">Narrow (12.5 kHz)</SelectItem></SelectContent>
                    </Select>
                  )}
                </FormField>
                {isDigital && (
                  <FormField label="Digital mode">
                    {({ id }) => (
                      <Select value={form.digital_mode || NONE} onValueChange={(v) => set('digital_mode')(v === NONE ? '' : v)}>
                        <SelectTrigger id={id}><SelectValue placeholder="Choose" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not specified</SelectItem>
                          {DIGITAL_MODES.map(m => <SelectItem key={m} value={m}>{digitalModeLabel(m)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                )}
                <FormField label="Timeout (s)" hint="Repeater timer, if it matters">
                  {({ id }) => <Input id={id} type="number" min={0} value={form.timeout_seconds} onChange={(e) => set('timeout_seconds')(e.target.value)} placeholder="180" />}
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Owner / trustee call" hint="Repeater or gateway licensee">
                  {({ id }) => <Input id={id} value={form.owner_callsign} onChange={(e) => set('owner_callsign')(e.target.value.toUpperCase())} placeholder="W4DOC" className="font-mono uppercase" />}
                </FormField>
                {isDigital && (
                  <>
                    <FormField label="Gateway call-SSID" hint="Winlink RMS / digipeater">
                      {({ id }) => <Input id={id} value={form.gateway_callsign} onChange={(e) => set('gateway_callsign')(e.target.value.toUpperCase())} placeholder="WD5EMA-10" className="font-mono uppercase" />}
                    </FormField>
                    <FormField label="Tactical address" hint="Winlink tactical mailbox">
                      {({ id }) => <Input id={id} value={form.tactical_address} onChange={(e) => set('tactical_address')(e.target.value.toUpperCase())} placeholder="WD5EMA" className="font-mono uppercase" />}
                    </FormField>
                  </>
                )}
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Who may use it" hint="Optional (ICS-217A 'eligible users')">
              {({ id }) => <Input id={id} value={form.eligible_users} onChange={(e) => set('eligible_users')(e.target.value)} placeholder="e.g. All ARES; Net control only" />}
            </FormField>
            <FormField label="Remarks">
              {({ id }) => <Input id={id} value={form.remarks} onChange={(e) => set('remarks')(e.target.value)} placeholder="EchoLink linked; 3-minute timeout" />}
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}>{channel ? 'Save changes' : 'Add channel'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
