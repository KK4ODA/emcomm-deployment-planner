import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, LayersControl, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Loader2, X, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { CallSign } from '@/components/common/CallSign';
import { ensureLeafletIcons, TILE_LAYERS } from './leafletSetup';
import { parseCoordinates, formatCoordinates, DEFAULT_MAP_CENTER } from '@/lib/coordinates';

ensureLeafletIcons();

const EMPTY = { name: '', description: '', address: '', contact_person: '', assigned_call_signs: [], sort_order: 1 };

function ClickToSet({ onPick }) {
  useMapEvents({ click(e) { onPick([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

function LocateMeButton() {
  const map = useMap();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (ref.current) { L.DomEvent.disableClickPropagation(ref.current); L.DomEvent.disableScrollPropagation(ref.current); }
  }, []);
  const locate = () => {
    if (!navigator.geolocation) { setError('Geolocation is not available'); return; }
    setBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { map.flyTo([pos.coords.latitude, pos.coords.longitude], 14); setBusy(false); },
      (err) => { setBusy(false); setError(err.message || 'Could not determine your location'); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  return (
    <div ref={ref} className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1">
      <button type="button" onClick={locate} disabled={busy} title="Centre on my location" className="rounded-md border bg-card p-2 shadow-md hover:bg-muted disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
      </button>
      {error && <span className="max-w-[200px] rounded border border-destructive/30 bg-card px-2 py-1 text-xs text-destructive shadow">{error}</span>}
    </div>
  );
}

/**
 * @param {{
 *   open: boolean, onClose: () => void, onSubmit: (data: typeof EMPTY) => void, location?: Object|null,
 *   users: Object[], allLocations: Object[], submitting?: boolean
 * }} props
 */
export function SiteForm({ open, onClose, onSubmit, location, users = [], allLocations = [], submitting }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(location ? {
      name: location.name || '', description: location.description || '', address: location.address || '',
      contact_person: location.contact_person || '', assigned_call_signs: location.assigned_call_signs || [],
      sort_order: location.sort_order ?? allLocations.length + 1,
    } : { ...EMPTY, sort_order: allLocations.length + 1 });
  }, [location, open, allLocations.length]);

  const coords = parseCoordinates(form.address);
  const assignedElsewhere = new Set(allLocations.filter(l => l.id !== location?.id).flatMap(l => l.assigned_call_signs || []));
  const available = users.map(u => u.call_sign).filter(cs => cs && !form.assigned_call_signs.includes(cs) && !assignedElsewhere.has(cs));

  const toggleCallSign = (cs, add) => setForm(f => ({
    ...f,
    assigned_call_signs: add ? [...f.assigned_call_signs, cs] : f.assigned_call_signs.filter(x => x !== cs),
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{location ? 'Edit site' : 'New site'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <FormField label="Site name" required>
              {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., County EOC" required autoFocus />}
            </FormField>
            <FormField label="Order">
              {({ id }) => <Input id={id} type="number" inputMode="numeric" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })} />}
            </FormField>
          </div>

          <FormField label="Purpose / notes" hint="Optional">
            {({ id }) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </FormField>

          <FormField label="Location" hint="Type “latitude, longitude” or click the map to drop a pin. Coordinates enable the map view and export.">
            {({ id }) => (
              <div className="space-y-2">
                <Input id={id} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="30.3322, -81.6557 or a street address" className="font-mono text-xs" />
                <div className="relative overflow-hidden rounded-md border">
                  <MapContainer key={location?.id ?? 'new'} center={coords || DEFAULT_MAP_CENTER} zoom={coords ? 13 : 4} style={{ height: 220 }} className="w-full">
                    <LayersControl position="topleft">
                      {Object.entries(TILE_LAYERS).map(([key, layer], index) => (
                        <LayersControl.BaseLayer key={key} checked={index === 0} name={layer.name}>
                          <TileLayer url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} />
                        </LayersControl.BaseLayer>
                      ))}
                    </LayersControl>
                    {coords && <Marker position={coords} />}
                    <ClickToSet onPick={(c) => setForm(f => ({ ...f, address: formatCoordinates(c) }))} />
                    <LocateMeButton />
                  </MapContainer>
                </div>
              </div>
            )}
          </FormField>

          <FormField label="Site contact (call sign)">
            {({ id }) => <Input id={id} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value.toUpperCase() })} className="font-mono uppercase" placeholder="e.g., KK4ODA" />}
          </FormField>

          <div className="space-y-1.5">
            <Label>Operators assigned to this site</Label>
            <div className="flex min-h-[2.5rem] flex-wrap gap-1.5 rounded-md border bg-muted/40 p-2">
              {form.assigned_call_signs.length === 0 ? (
                <span className="text-xs text-muted-foreground">No operators assigned</span>
              ) : form.assigned_call_signs.map(cs => (
                <button key={cs} type="button" onClick={() => toggleCallSign(cs, false)} aria-label={`Remove ${cs}`} className="group inline-flex items-center gap-1 rounded">
                  <CallSign value={cs} size="md" />
                  <X className="h-3 w-3 text-muted-foreground group-hover:text-destructive" />
                </button>
              ))}
            </div>
            {available.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {available.map(cs => (
                  <Button key={cs} type="button" variant="outline" size="sm" className="h-7 font-mono text-xs" onClick={() => toggleCallSign(cs, true)}>
                    <Plus className="h-3 w-3" /> {cs}
                  </Button>
                ))}
              </div>
            )}
            {available.length === 0 && form.assigned_call_signs.length === 0 && (
              <p className="text-xs text-muted-foreground">Every member with a call sign is already assigned to another site.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>{location ? 'Save changes' : 'Create site'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
