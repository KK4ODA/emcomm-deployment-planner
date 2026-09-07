import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import { ensureLeafletIcons, TILE_LAYERS } from './leafletSetup';
import { parseCoordinates, frameLocations } from '@/lib/coordinates';
import { locationItemStats } from '@/lib/deployments';

ensureLeafletIcons();

/**
 * All sites with coordinates on one map. Tiles need a network connection;
 * the map itself and the markers work offline.
 * @param {{ locations: Object[], items: Object[], onSelect?: (location: Object) => void, className?: string }} props
 */
export function SiteMap({ locations, items, onSelect, className }) {
  const located = useMemo(
    () => locations.map(l => ({ ...l, coords: parseCoordinates(l.address) })).filter(l => l.coords),
    [locations],
  );
  const { center, zoom } = useMemo(() => frameLocations(located), [located]);

  return (
    <div className={className ?? 'relative h-[60vh] min-h-[360px] overflow-hidden rounded-lg border'}>
      <MapContainer key={`${center.join(',')}-${zoom}`} center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <LayersControl position="topright">
          {Object.entries(TILE_LAYERS).map(([key, layer], index) => (
            <LayersControl.BaseLayer key={key} checked={index === 0} name={layer.name}>
              <TileLayer url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} />
            </LayersControl.BaseLayer>
          ))}
        </LayersControl>
        {located.map(loc => {
          const stats = locationItemStats(items, loc.id);
          return (
            <Marker key={loc.id} position={loc.coords} eventHandlers={{ click: () => onSelect?.(loc) }}>
              <Popup>
                <div className="min-w-[10rem] text-sm">
                  <p className="font-semibold">{loc.name}</p>
                  {loc.description && <p className="text-xs text-slate-600">{loc.description}</p>}
                  <p className="mt-1 text-xs text-slate-600">{stats.itemCount} items · {stats.assigneeCount} operators</p>
                  {loc.contact_person && <p className="text-xs text-slate-600">Contact: {loc.contact_person}</p>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {located.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-background/80 p-6 text-center">
          <div>
            <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No sites have coordinates yet</p>
            <p className="text-xs text-muted-foreground">Enter “latitude, longitude” in a site's address, or pick the spot on the map when editing it.</p>
          </div>
        </div>
      )}
    </div>
  );
}
