import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Radio, Save, BatteryCharging, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { updateProfile } from '@/api/auth';
import { describeError } from '@/components/common/ErrorState';
import { CAPABILITIES, STATION_TYPES, LICENSE_CLASSES } from '@/lib/capabilities';
import { cn } from '@/lib/utils';

const NONE = '__none__';

/** Toggle chip list for a vocabulary. */
function ChipGroup({ options, value, onChange, label }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  const groups = [...new Set(options.map(o => o.group))];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {groups.map(g => (
        <div key={g} className="flex flex-wrap items-center gap-1.5">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{g}</span>
          {options.filter(o => o.group === g).map(o => {
            const on = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(o.id)}
                className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
                title={o.label}
              >
                {o.short || o.label}
              </button>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}

/**
 * "What I can do": the short capability profile that positions are matched
 * against. Deliberately few fields; everything is optional.
 * @param {{ user: Object, onSaved: () => Promise<any> }} props
 */
export function CapabilitiesCard({ user, onSaved }) {
  const [form, setForm] = useState({ license_class: '', capabilities: [], station_types: [], power_hours: '', locality: '', equipment_notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      license_class: user.license_class || '', capabilities: user.capabilities || [], station_types: user.station_types || [],
      power_hours: user.power_hours ?? '', locality: user.locality || '', equipment_notes: user.equipment_notes || '',
    });
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(user.id, {
        license_class: form.license_class || null,
        capabilities: form.capabilities,
        station_types: form.station_types,
        power_hours: form.power_hours === '' ? null : Number(form.power_hours),
        locality: form.locality.trim() || null,
        equipment_notes: form.equipment_notes.trim() || null,
      });
      await onSaved();
      toast.success('Capabilities saved');
    } catch (err) {
      toast.error(`Could not save: ${describeError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const filled = [form.license_class, form.capabilities.length, form.station_types.length, form.power_hours !== '', form.locality].filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Radio className="h-4 w-4" /> What I can do</CardTitle>
        <CardDescription>Coordinators match positions against this. Tick what applies; leave the rest blank. {filled < 3 && <span className="text-warning">A few more answers make you easier to place.</span>}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Licence class">
              {({ id }) => (
                <Select value={form.license_class || NONE} onValueChange={(v) => setForm({ ...form, license_class: v === NONE ? '' : v })}>
                  <SelectTrigger id={id}><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {LICENSE_CLASSES.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Independent power" icon={BatteryCharging} hint="Hours you can operate without mains power">
              {({ id }) => <Input id={id} type="number" min={0} max={72} step={0.5} value={form.power_hours} onChange={(e) => setForm({ ...form, power_hours: e.target.value })} placeholder="e.g. 8" />}
            </FormField>
            <FormField label="Home area" icon={MapPin} hint="Town or county, for travel planning">
              {({ id }) => <Input id={id} value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} placeholder="e.g. Decatur" />}
            </FormField>
          </div>
          <ChipGroup label="Modes and services" options={CAPABILITIES} value={form.capabilities} onChange={(v) => setForm({ ...form, capabilities: v })} />
          <ChipGroup label="Station and mobility" options={STATION_TYPES} value={form.station_types} onChange={(v) => setForm({ ...form, station_types: v })} />
          <FormField label="Equipment notes" hint="Anything a coordinator should know: radios, antennas, vehicle, limits">
            {({ id }) => <Textarea id={id} rows={2} value={form.equipment_notes} onChange={(e) => setForm({ ...form, equipment_notes: e.target.value })} placeholder="e.g. FT-5DR + FTM-150 mobile with mag mount, 10 Ah battery, Mobilinkd for APRS" />}
          </FormField>
          <Button type="submit" loading={saving}><Save /> Save capabilities</Button>
        </form>
      </CardContent>
    </Card>
  );
}
