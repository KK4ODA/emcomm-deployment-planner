import React, { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, GeoJSON } from 'react-leaflet';
import { ensureLeafletIcons, TILE_LAYERS } from '@/features/sites/leafletSetup';
import { layerBounds, unionBounds } from '@/lib/geo';
import { openExternal } from '@/lib/platform';

ensureLeafletIcons();

/**
 * Small, non-interactive map for the packet: the site pin over the course
 * layers. Tiles are cached by the service worker once seen, so it survives
 * offline; tapping opens directions.
 * @param {{ site: { lat?: number|null, lon?: number|null, name?: string }|null, layers?: Object[], directions?: string|null, className?: string }} props
 */
export function PacketMap({ site, layers = [], directions = null, className }) {
  const lat = site?.lat ?? null, lon = site?.lon ?? null;
  const pin = useMemo(() => (lat != null && lon != null ? /** @type {[number, number]} */ ([lat, lon]) : null), [lat, lon]);
  const bounds = useMemo(() => unionBounds([
    ...layers.map(l => layerBounds(l.geojson)),
    ...(pin ? [/** @type {[[number, number], [number, number]]} */ ([pin, pin])] : []),
  ]), [layers, pin]);
  if (!pin && !bounds) return null;
  const spans = bounds && (bounds[0][0] !== bounds[1][0] || bounds[0][1] !== bounds[1][1]);
  const key = spans ? `b:${bounds.flat().join(',')}` : `c:${pin?.join(',')}`;
  const street = TILE_LAYERS.street;
  return (
    <div
      className={className ?? 'relative h-48 overflow-hidden rounded-lg border print:h-40 print:border-2'}
      role={directions ? 'link' : undefined}
      aria-label={directions ? `Map of ${site?.name || 'the site'}; opens directions` : `Map of ${site?.name || 'the area'}`}
      onClick={directions ? () => openExternal(directions) : undefined}
      style={directions ? { cursor: 'pointer' } : undefined}
    >
      <MapContainer
        key={key}
        {...(spans ? { bounds, boundsOptions: { padding: [16, 16] } } : { center: pin, zoom: 15 })}
        className="h-full w-full"
        zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} keyboard={false} attributionControl={false}
      >
        <TileLayer url={street.url} attribution={street.attribution} maxZoom={street.maxZoom} />
        {layers.map(layer => (
          <GeoJSON
            key={layer.id}
            data={layer.geojson}
            style={(f) => ({ color: f?.properties?.color || layer.color || '#2563eb', weight: 3, opacity: 0.9, fillOpacity: 0.12 })}
            pointToLayer={(f, latlng) => L.circleMarker(latlng, { radius: 4, color: f?.properties?.color || layer.color || '#2563eb', weight: 2, fillOpacity: 0.9 })}
          />
        ))}
        {pin && <Marker position={pin} interactive={false} />}
      </MapContainer>
      <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/80 px-1 text-[10px] text-muted-foreground">© OpenStreetMap</span>
    </div>
  );
}
