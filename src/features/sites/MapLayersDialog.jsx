import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Upload, Trash2, MapPin, Route } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/common/FormField';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { reportMutationError } from '@/hooks/useEntities';
import { parseGeoFile, layerSummary, waypointsOf, routeLengthKm, LAYER_COLORS } from '@/lib/geo';
import { formatCoordinates } from '@/lib/coordinates';
import { cn } from '@/lib/utils';

const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Import course routes, boundaries and waypoints (KML, GPX, GeoJSON) as map
 * layers, and turn waypoints into sites.
 * @param {{ open: boolean, onClose: () => void, deployment: Object, layers: Object[], locations: Object[], userId: string|null }} props
 */
export function MapLayersDialog({ open, onClose, deployment, layers, locations, userId }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [draft, setDraft] = useState(/** @type {{ name: string, color: string, fc: Object, summary: Object, file: string }|null} */ (null));
  const [error, setError] = useState('');
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: queryKeys.mapLayers }); queryClient.invalidateQueries({ queryKey: queryKeys.locations }); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES) { setError('That file is over 3 MB. Simplify the route (fewer points) and try again.'); return; }
    try {
      const text = await file.text();
      const fc = parseGeoFile(text, file.name);
      const summary = layerSummary(fc);
      if (!summary.features) { setError('No points, lines or areas found in that file.'); return; }
      setDraft({ name: file.name.replace(/\.[^.]+$/, ''), color: LAYER_COLORS[layers.length % LAYER_COLORS.length], fc, summary, file: file.name });
    } catch (err) {
      setError(err?.message || 'Could not read that file');
    }
  };

  const save = useMutation({
    mutationFn: () => db.mapLayers.create({
      deployment_id: deployment.id, name: draft.name.trim() || draft.file, kind: draft.summary.kind, color: draft.color,
      geojson: draft.fc, source_file: draft.file, sort_order: layers.length, created_by: userId,
    }),
    onSuccess: () => { invalidate(); setDraft(null); toast.success('Layer added to the map'); },
    onError: reportMutationError('Add layer'),
  });
  const remove = useMutation({ mutationFn: (/** @type {string} */ id) => db.mapLayers.remove(id), onSuccess: () => { invalidate(); toast.success('Layer removed'); }, onError: reportMutationError('Remove layer') });
  const addSites = useMutation({
    mutationFn: async (/** @type {Object} */ layer) => {
      const existing = new Set(locations.map(l => (l.name || '').trim().toLowerCase()));
      const candidates = waypointsOf(layer.geojson).filter(w => !existing.has(w.name.trim().toLowerCase()));
      let order = Math.max(0, ...locations.map(l => l.sort_order || 0));
      for (const w of candidates) {
        order += 1;
        await db.locations.create({ deployment_id: deployment.id, name: w.name, description: w.description, address: formatCoordinates([w.lat, w.lon]), lat: w.lat, lon: w.lon, sort_order: order });
      }
      return { created: candidates.length, skipped: waypointsOf(layer.geojson).length - candidates.length };
    },
    onSuccess: ({ created, skipped }) => { invalidate(); toast.success(`${created} site${created === 1 ? '' : 's'} created`, { description: skipped ? `${skipped} already existed by name.` : undefined }); },
    onError: reportMutationError('Create sites'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDraft(null); setError(''); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Map layers</DialogTitle>
          <DialogDescription>Course routes, boundaries and waypoints from the served agency, drawn under the sites. KML, GPX or GeoJSON; the file stays with this deployment.</DialogDescription>
        </DialogHeader>

        <input ref={fileRef} type="file" accept=".kml,.gpx,.geojson,.json,application/vnd.google-earth.kml+xml,application/gpx+xml,application/geo+json" className="hidden" onChange={onFile} aria-label="Choose a KML, GPX or GeoJSON file" />
        {!draft && <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Choose a file</Button>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {draft && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3 rounded-md border p-3">
            <p className="text-sm">
              <strong>{draft.file}</strong>: {[draft.summary.lines && `${draft.summary.lines} route${draft.summary.lines === 1 ? '' : 's'}${routeLengthKm(draft.fc) ? ` (${routeLengthKm(draft.fc)} km)` : ''}`, draft.summary.polygons && `${draft.summary.polygons} area${draft.summary.polygons === 1 ? '' : 's'}`, draft.summary.points && `${draft.summary.points} point${draft.summary.points === 1 ? '' : 's'}`].filter(Boolean).join(', ')}
            </p>
            <FormField label="Layer name" required>{({ id }) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />}</FormField>
            <div>
              <p className="mb-1 text-sm font-medium">Colour</p>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Layer colour">
                {LAYER_COLORS.map(c => <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={c} onClick={() => setDraft({ ...draft, color: c })} className={cn('h-7 w-7 rounded-full border-2', draft.color === c ? 'border-foreground' : 'border-transparent')} style={{ backgroundColor: c }} />)}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" loading={save.isPending}><Layers /> Add layer</Button>
            </div>
          </form>
        )}

        {layers.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {layers.map(l => {
              const summary = layerSummary(l.geojson);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color || '#2563eb' }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{[summary.lines && `${summary.lines} route${summary.lines === 1 ? '' : 's'}`, summary.polygons && `${summary.polygons} area${summary.polygons === 1 ? '' : 's'}`, summary.points && `${summary.points} point${summary.points === 1 ? '' : 's'}`].filter(Boolean).join(', ')}{l.source_file ? ` · ${l.source_file}` : ''}</p>
                  </div>
                  <Badge variant="outline">{l.kind === 'route' ? <Route className="mr-1 h-3 w-3" /> : null}{l.kind}</Badge>
                  {summary.points > 0 && <Button size="sm" variant="outline" onClick={() => addSites.mutate(l)} loading={addSites.isPending}><MapPin /> Sites from {summary.points} point{summary.points === 1 ? '' : 's'}</Button>}
                  <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Remove ${l.name}`} onClick={() => remove.mutate(l.id)} disabled={remove.isPending}><Trash2 /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
