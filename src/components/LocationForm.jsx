import React, { useState, useEffect } from 'react';
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
import { X } from "lucide-react";

export default function LocationForm({ open, onClose, onSubmit, location, users = [], allLocations = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    address: '',
    contact_person: '',
    assigned_call_signs: [],
    sort_order: 0
  });

  useEffect(() => {
    if (location) {
      setFormData({
        name: location.name || '',
        description: location.description || '',
        address: location.address || '',
        contact_person: location.contact_person || '',
        assigned_call_signs: location.assigned_call_signs || [],
        sort_order: location.sort_order || 0
      });
    } else {
      setFormData({
        name: '',
        description: '',
        address: '',
        contact_person: '',
        assigned_call_signs: [],
        sort_order: 0
      });
    }
  }, [location, open]);

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{location ? 'Edit Location' : 'New Location'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Location Name</Label>
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
              placeholder="Purpose or details about this location"
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
              Enter coordinates as: latitude, longitude (e.g., 40.7128, -74.0060) to show on map
            </p>
          </div>

          <div>
            <Label htmlFor="contact">Contact Person (Call Sign)</Label>
            <Input
              id="contact"
              placeholder="Call sign of location lead"
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
              {location ? 'Update Location' : 'Create Location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}