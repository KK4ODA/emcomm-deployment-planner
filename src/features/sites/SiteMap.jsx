import React, { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, LayersControl, GeoJSON } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import { ensureLeafletIcons, TILE_LAYERS } from './leafletSetup';
import { parseCoordinates, frameLocations } from '@/lib/coordinates';
import { locationItemStats } from '@/lib/deployments';
import { layerBounds, unionBounds } from '@/lib/geo';

ensureLeafletIcons();

/**
 * All sites with coordinates on one map, over any imported layers (course
 * route, boundaries, waypoints). Tiles need a network connection; the map,
 * markers and layers work offline.
 * @param {{ locations: Object[], items: Object[], layers?: Object[], coverage?: Object|null, onSelect?: (location: Object) => void, className?: string }} props
 */
export function SiteMap({ locations, items, layers = [], coverage = null, onSelect, className }) {
  const located = useMemo(
    () => locations.map(l => ({ ...l, coords: parseCoordinates(l.address) })).filter(l => l.coords),
    [locations],
  );
  const bounds = useMemo(() => unionBounds([
    ...layers.map(l => layerBounds(l.geojson)),
    ...located.map(l => /** @type {[[number, number], [number, number]]} */ ([l.coords, l.coords])),
  ]), [layers, located]);
  const { center, zoom } = useMemo(() => frameLocations(located), [located]);
  const spans = bounds && (bounds[0][0] !== bounds[1][0] || bounds[0][1] !== bounds[1][1]);
  const mapKey = spans ? `b:${bounds.flat().join(',')}` : `c:${center.join(',')}-${zoom}`;

  return (
    <div className={className ?? 'relative h-[60vh] min-h-[360px] overflow-hidden rounded-lg border'}>
      <MapContainer key={mapKey} {...(spans ? { bounds, boundsOptions: { padding: [24, 24] } } : { center, zoom })} scrollWheelZoom className="h-full w-full">
        <LayersControl position="topright">
          {Object.entries(TILE_LAYERS).map(([key, layer], index) => (
            <LayersControl.BaseLayer key={key} checked={index === 0} name={layer.name}>
              <TileLayer url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} />
            </LayersControl.BaseLayer>
          ))}
          {coverage && coverage.features?.length > 0 && (
            <LayersControl.Overlay checked name="Coverage checks">
              <GeoJSON
                key={`cov-${coverage.features.length}-${coverage.features.map(f => f.properties?.id).join('.')}`}
                data={coverage}
                style={(f) => ({ color: f?.properties?.color || '#4b5563', weight: 4, opacity: 0.85, dashArray: f?.properties?.result === 'fail' ? '6 6' : undefined })}
                pointToLayer={(f, latlng) => L.circleMarker(latlng, { radius: 6, color: f?.properties?.color || '#4b5563', weight: 2, fillOpacity: 0.9 })}
                onEachFeature={(f, l) => { if (f.properties?.name) l.bindTooltip(String(f.properties.name), { sticky: true }); }}
              />
            </LayersControl.Overlay>
          )}
          {layers.map(layer => {
            const color = layer.color || '#2563eb';
            return (
              <LayersControl.Overlay key={layer.id} checked name={layer.name}>
                <GeoJSON
                  data={layer.geojson}
                  style={(f) => ({ color: f?.properties?.color || color, weight: 3, opacity: 0.9, fillOpacity: 0.12 })}
                  pointToLayer={(f, latlng) => L.circleMarker(latlng, { radius: 5, color: f?.properties?.color || color, weight: 2, fillOpacity: 0.9 })}
                  onEachFeature={(f, l) => { if (f.properties?.name) l.bindTooltip(String(f.properties.name), { direction: 'top', offset: [0, -4] }); }}
                />
              </LayersControl.Overlay>
            );
          })}
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
      {located.length === 0 && layers.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-background/80 p-6 text-center">
          <div>
            <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No sites have coordinates yet</p>
            <p className="text-xs text-muted-foreground">Enter “latitude, longitude” in a site's address, pick the spot on the map when editing it, or import the course KML under Map layers.</p>
          </div>
        </div>
      )}
    </div>
  );
}
