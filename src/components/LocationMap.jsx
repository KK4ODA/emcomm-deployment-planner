import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin, Package, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Function to parse various coordinate formats
function parseCoordinates(address) {
  if (!address) return null;
  
  // Try to match common coordinate formats
  // Format: "lat, lon" or "lat,lon"
  const coordRegex = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
  const match = address.match(coordRegex);
  
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    
    // Basic validation
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return [lat, lon];
    }
  }
  
  return null;
}

export default function LocationMap({ locations, items = [], onLocationClick }) {
  const [center, setCenter] = useState([39.8283, -98.5795]); // Center of US
  const [zoom, setZoom] = useState(4);
  const [what3wordsData, setWhat3wordsData] = useState({});

  // Calculate map bounds and fetch what3words for locations
  useEffect(() => {
    const validLocations = locations
      .map(loc => ({ ...loc, coords: parseCoordinates(loc.address) }))
      .filter(loc => loc.coords);

    if (validLocations.length > 0) {
      // Calculate average center
      const avgLat = validLocations.reduce((sum, loc) => sum + loc.coords[0], 0) / validLocations.length;
      const avgLon = validLocations.reduce((sum, loc) => sum + loc.coords[1], 0) / validLocations.length;
      setCenter([avgLat, avgLon]);
      setZoom(validLocations.length === 1 ? 10 : 8);

      // Fetch what3words for each location (with caching)
      validLocations.forEach(async (loc) => {
        // Skip if we already have data for this location
        if (what3wordsData[loc.id]) return;
        
        try {
          const response = await base44.functions.invoke('getWhat3Words', {
            lat: loc.coords[0],
            lng: loc.coords[1]
          });
          setWhat3wordsData(prev => ({
            ...prev,
            [loc.id]: response.data.words
          }));
        } catch (error) {
          // Silently handle rate limit errors
          if (!error.message?.includes('Rate limit')) {
            console.error('Failed to fetch what3words:', error);
          }
        }
      });
    }
  }, [locations, what3wordsData]);

  const getLocationStats = (locationId) => {
    const locationItems = items.filter(i => i.deployment_location_id === locationId);
    const assignedUsers = new Set(locationItems.map(i => i.assigned_to).filter(Boolean));
    return {
      itemCount: locationItems.length,
      userCount: assignedUsers.size
    };
  };

  const locationsWithCoords = locations
    .map(loc => ({ ...loc, coords: parseCoordinates(loc.address) }))
    .filter(loc => loc.coords);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-slate-200">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {locationsWithCoords.map(location => {
          const stats = getLocationStats(location.id);
          
          return (
            <Marker
              key={location.id}
              position={location.coords}
              eventHandlers={{
                click: () => onLocationClick && onLocationClick(location)
              }}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-semibold text-slate-900 mb-1">{location.name}</h3>
                  {location.description && (
                    <p className="text-sm text-slate-600 mb-2">{location.description}</p>
                  )}
                  {what3wordsData[location.id] && (
                    <div className="mb-2 p-1 bg-rose-50 rounded text-xs">
                      <span className="text-rose-600 font-mono">
                        ///{what3wordsData[location.id]}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      <span>{stats.itemCount} items</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{stats.userCount} assigned</span>
                    </div>
                    {location.contact_person && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>Contact: {location.contact_person}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      {locationsWithCoords.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center p-6">
            <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600 font-medium">No locations with coordinates</p>
            <p className="text-xs text-slate-500 mt-1">
              Add coordinates to location addresses to see them on the map
            </p>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Format: latitude, longitude (e.g., 40.7128, -74.0060)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}