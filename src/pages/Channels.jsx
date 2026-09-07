import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Radio, Plus, Pencil, Trash2, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { SearchInput } from '@/components/common/SearchInput';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useAresGroups, useChannels } from '@/hooks/useEntities';
import { hasPermission } from '@/lib/permissions';
import { channelSummary, CHANNEL_CONFIGS, digitalModeLabel } from '@/lib/comms';
import { ChannelForm } from '@/features/comms/ChannelForm';
import { useChannelMutations } from '@/features/comms/useCommsMutations';
import { cn } from '@/lib/utils';

/** The ARES group's channel library (ICS-217A). Deployments pick from it. */
export default function Channels() {
  const { user } = useAuth();
  const groupsQ = useAresGroups();
  const channelsQ = useChannels();
  const mutations = useChannelMutations();
  const { confirm, dialog } = useConfirm();
  const canEdit = hasPermission(user?.app_role, 'MANAGE_CHANNELS');

  const myGroups = useMemo(() => {
    const all = groupsQ.data ?? [];
    return user?.app_role === 'admin' ? all : all.filter(g => user?.ares_group_ids?.includes(g.id));
  }, [groupsQ.data, user]);
  const [groupId, setGroupId] = useState('');
  const activeGroup = groupId || myGroups[0]?.id || '';
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ open: false, channel: null });

  const channels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (channelsQ.data ?? [])
      .filter(c => c.ares_group_id === activeGroup && (showInactive || c.active !== false))
      .filter(c => !q || [c.name, c.owner_callsign, c.remarks, String(c.rx_freq ?? '')].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  }, [channelsQ.data, activeGroup, search, showInactive]);

  const remove = async (channel) => {
    const ok = await confirm({ title: `Delete “${channel.name}”?`, description: 'Plans that already include it keep their copy. Prefer "Mark inactive" if it may come back.', destructive: true });
    if (ok) mutations.remove.mutate(channel.id);
  };

  const inactiveCount = (channelsQ.data ?? []).filter(c => c.ares_group_id === activeGroup && c.active === false).length;

  return (
    <>
      <PageHeader
        icon={Radio}
        title="Channel library"
        description="Repeaters, simplex channels, digital gateways and phone numbers your group uses. Every communications plan picks from here."
        actions={canEdit && activeGroup && <Button onClick={() => setForm({ open: true, channel: null })}><Plus /> Channel</Button>}
      />
      <QueryState queries={[groupsQ, channelsQ]}>
        {myGroups.length === 0 ? (
          <EmptyState icon={Radio} title="No ARES group" description="Join a group to see its channel library." />
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              {myGroups.length > 1 && (
                <Select value={activeGroup} onValueChange={setGroupId}>
                  <SelectTrigger className="w-full sm:w-64" aria-label="ARES group"><SelectValue /></SelectTrigger>
                  <SelectContent>{myGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, call, frequency…" className="flex-1" />
              {inactiveCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowInactive(v => !v)}>{showInactive ? <EyeOff /> : <Eye />} {showInactive ? 'Hide' : 'Show'} {inactiveCount} inactive</Button>
              )}
            </div>

            {channels.length === 0 ? (
              <EmptyState
                icon={Radio}
                title={search ? 'No channel matches' : 'No channels yet'}
                description={search ? 'Try another search.' : 'Start with your primary and backup repeaters, a simplex channel and your Winlink gateway. You will never type them again.'}
                action={canEdit && !search && <Button onClick={() => setForm({ open: true, channel: null })}><Plus /> Add the first channel</Button>}
              />
            ) : (
              <div className="rounded-lg border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Programming</TableHead>
                      <TableHead className="hidden md:table-cell">Kind</TableHead>
                      <TableHead className="hidden lg:table-cell">Owner</TableHead>
                      <TableHead className="hidden lg:table-cell">Remarks</TableHead>
                      {canEdit && <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.map(c => (
                      <TableRow key={c.id} className={cn(c.active === false && 'opacity-60')}>
                        <TableCell>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.band}{c.mode === 'D' && c.digital_mode ? ` · ${digitalModeLabel(c.digital_mode)}` : ''}{c.active === false ? ' · inactive' : ''}</p>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{channelSummary(c)}{c.timeout_seconds ? <span className="ml-2 text-xs text-muted-foreground">TOT {c.timeout_seconds}s</span> : null}</TableCell>
                        <TableCell className="hidden md:table-cell"><Badge variant="outline">{CHANNEL_CONFIGS[c.config] || c.config}</Badge></TableCell>
                        <TableCell className="hidden font-mono text-xs lg:table-cell">{c.owner_callsign || '—'}</TableCell>
                        <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground lg:table-cell">{c.remarks || c.eligible_users || ''}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex justify-end">
                              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setForm({ open: true, channel: c })}><Pencil /></Button>
                              <Button variant="ghost" size="icon-sm" aria-label={c.active === false ? `Reactivate ${c.name}` : `Mark ${c.name} inactive`} onClick={() => mutations.setActive.mutate({ id: c.id, active: c.active === false })}>{c.active === false ? <Eye /> : <EyeOff />}</Button>
                              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} className="text-destructive hover:text-destructive" onClick={() => remove(c)}><Trash2 /></Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </QueryState>

      <ChannelForm
        open={form.open}
        channel={form.channel}
        groupId={activeGroup}
        onClose={() => setForm({ open: false, channel: null })}
        onSubmit={(data) => mutations.save.mutate({ id: form.channel?.id, data: form.channel ? data : { ...data, sort_order: channels.length } }, { onSuccess: () => { setForm({ open: false, channel: null }); toast.success(form.channel ? 'Channel saved' : 'Channel added'); } })}
        submitting={mutations.save.isPending}
      />
      {dialog}
    </>
  );
}
