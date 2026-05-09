import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Crosshair, Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, LayersControl, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Ensure default Leaflet marker icons load (LocationMap.jsx does the same;
// repeating here makes the form robust if opened before the map renders)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Parse "lat, lng" out of a free-form address string
function parseCoords(s) {
  if (!s) return null;
  const m = s.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

// Click-to-set helper rendered inside the MapContainer
function ClickToSet({ onPick }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// Floating "locate me" button rendered inside the MapContainer
function LocateMeButton() {
  const map = useMap();
  const btnRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Prevent map click/scroll handlers from firing through the button
    if (btnRef.current) {
      L.DomEvent.disableClickPropagation(btnRef.current);
      L.DomEvent.disableScrollPropagation(btnRef.current);
    }
  }, []);

  const locate = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 14);
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        setError(err.message || 'Could not determine your location');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  return (
    <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-1">
      <button
        ref={btnRef}
        type="button"
        onClick={locate}
        disabled={busy}
        className="bg-white border border-slate-300 rounded-md p-2 shadow-md hover:bg-slate-50 disabled:opacity-60"
        title="Center on my location"
      >
        {busy
          ? <Loader2 className="h-4 w-4 text-slate-700 animate-spin" />
          : <Crosshair className="h-4 w-4 text-slate-700" />}
      </button>
      {error && (
        <span className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-2 py-1 rounded shadow-sm max-w-[200px]">
          {error}
        </span>
      )}
    </div>
  );
}

export default function LocationForm({ open, onClose, onSubmit, location, users = [], allLocations = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    contact_person: '',
    assigned_call_signs: [],
    sort_order: 1
  });

  useEffect(() => {
    if (location) {
      setFormData({
        name: location.name || '',
        description: location.description || '',
        address: location.address || '',
        contact_person: location.contact_person || '',
        assigned_call_signs: location.assigned_call_signs || [],
        sort_order: location.sort_order ?? 1
      });
    } else {
      setFormData({
        name: '',
        description: '',
        address: '',
        contact_person: '',
        assigned_call_signs: [],
        sort_order: 1
      });
    }
  }, [location, open]);

  const pickedCoords = parseCoords(formData.address);
  const mapCenter = pickedCoords || [39.8283, -98.5795]; // default: continental US
  const mapZoom = pickedCoords ? 13 : 4;

  const handleMapPick = ([lat, lng]) => {
    // 5 decimals is ~1.1m at the equator — plenty for site location
    setFormData({ ...formData, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Get call signs already assigned to other locations
  const assignedElsewhere = allLocations
    .filter(loc => loc.id !== location?.id)
    .flatMap(loc => loc.assigned_call_signs || []);

  // Available call signs (not assigned to other locations)
  const availableCallSigns = users
    .filter(u => u.call_sign && !assignedElsewhere.includes(u.call_sign))
    .map(u => u.call_sign);

  const handleAddCallSign = (callSign) => {
    if (!formData.assigned_call_signs.includes(callSign)) {
      setFormData({
        ...formData,
        assigned_call_signs: [...formData.assigned_call_signs, callSign]
      });
    }
  };

  const handleRemoveCallSign = (callSign) => {
    setFormData({
      ...formData,
      assigned_call_signs: formData.assigned_call_signs.filter(cs => cs !== callSign)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{location ? 'Edit Site' : 'New Site'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Site Name</Label>
            <Input
              id="name"
              placeholder="e.g., Main Command Post"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Purpose or details about this site"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="address">Address/Coordinates</Label>
            <Input
              id="address"
              placeholder="40.7128, -74.0060"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-1">
              Enter coordinates as: latitude, longitude — or click on the map below to drop a pin
            </p>
            <div className="mt-2 rounded-lg overflow-hidden border border-slate-200">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ height: '220px', width: '100%' }}
                key={location?.id ?? 'new'}
              >
                <LayersControl position="topleft">
                  <LayersControl.BaseLayer checked name="Street">
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite">
                    <TileLayer
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={19}
                    />
                  </LayersControl.BaseLayer>
                </LayersControl>
                {pickedCoords && <Marker position={pickedCoords} />}
                <ClickToSet onPick={handleMapPick} />
                <LocateMeButton />
              </MapContainer>
            </div>
          </div>

          <div>
            <Label htmlFor="contact">Contact Person (Call Sign)</Label>
            <Input
              id="contact"
              placeholder="Call sign of site lead"
              value={formData.contact_person}
              onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
            />
          </div>

          <div>
            <Label>Assigned Call Signs</Label>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-slate-200 rounded-lg bg-slate-50">
                {formData.assigned_call_signs.length === 0 ? (
                  <span className="text-sm text-slate-400">No call signs assigned</span>
                ) : (
                  formData.assigned_call_signs.map(cs => (
                    <Badge key={cs} variant="secondary" className="gap-1">
                      {cs}
                      <button
                        type="button"
                        onClick={() => handleRemoveCallSign(cs)}
                        className="ml-1 hover:text-rose-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              {availableCallSigns.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableCallSigns.map(cs => (
                    <Button
                      key={cs}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddCallSign(cs)}
                      className="text-xs"
                    >
                      + {cs}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              {location ? 'Update Site' : 'Create Site'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}