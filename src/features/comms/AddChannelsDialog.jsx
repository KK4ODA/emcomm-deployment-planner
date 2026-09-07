import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { SearchInput } from '@/components/common/SearchInput';
import { channelSummary, CONDITIONS, PATH_ROLES, CHANNEL_FUNCTIONS } from '@/lib/comms';
import { ROUTES } from '@/app/routes';

/**
 * Pick library channels to add to the plan, with the condition, PACE role,
 * function and net they get.
 * @param {{ open: boolean, onClose: () => void, channels: Object[], alreadyIn: Set<string>, onSubmit: (data: { channels: Object[], condition_level: number, path_role: string, func: string, net: string }) => void, submitting?: boolean, nets: string[] }} props
 */
export function AddChannelsDialog({ open, onClose, channels, alreadyIn, onSubmit, submitting, nets }) {
  const [selected, setSelected] = useState(/** @type {string[]} */ ([]));
  const [search, setSearch] = useState('');
  const [condition, setCondition] = useState('1');
  const [role, setRole] = useState('primary');
  const [func, setFunc] = useState('Tactical');
  const [net, setNet] = useState('');

  useEffect(() => { if (open) { setSelected([]); setSearch(''); } }, [open]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter(c => c.active !== false && (!q || [c.name, c.owner_callsign, String(c.rx_freq ?? '')].some(v => v?.toLowerCase().includes(q))));
  }, [channels, search]);

  const toggle = (id) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add channels from the library</DialogTitle>
          <DialogDescription>Each chosen channel is copied into this plan with the settings below. You can adjust rows afterwards.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <FormField label="Condition">
            {({ id }) => (
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CONDITIONS).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}: {c.title}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Role">
            {({ id }) => (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PATH_ROLES).map(([k, r]) => <SelectItem key={k} value={k}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Function">
            {({ id }) => (
              <Select value={func} onValueChange={setFunc}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNEL_FUNCTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Net" hint="Optional">
            {({ id }) => <Input id={id} list="nets-list" value={net} onChange={(e) => setNet(e.target.value)} placeholder="RACE" />}
          </FormField>
        </div>
        <datalist id="nets-list">{nets.map(n => <option key={n} value={n} />)}</datalist>
        <SearchInput value={search} onChange={setSearch} placeholder="Filter the library" />
        {channels.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">The channel library is empty. <Link to={ROUTES.channels} className="underline">Add your repeaters and simplex channels</Link> first.</p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {list.map(c => {
              const dup = alreadyIn.has(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                    <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{c.name}{dup && <span className="ml-2 text-xs font-normal text-muted-foreground">already in plan</span>}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{channelSummary(c)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => onSubmit({ channels: channels.filter(c => selected.includes(c.id)), condition_level: Number(condition), path_role: role, func, net: net.trim() })} loading={submitting} disabled={!selected.length}>
            Add {selected.length || ''} to plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
