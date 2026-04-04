import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Shield } from "lucide-react";

export default function ARESGroupForm({ open, onClose, onSubmit, group, users }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    region: '',
    admin_user_ids: []
  });

  useEffect(() => {
    if (group) {
      setFormData({
        name: group.name || '',
        description: group.description || '',
        region: group.region || '',
        admin_user_ids: group.admin_user_ids || []
      });
    } else if (open) {
      setFormData({
        name: '',
        description: '',
        region: '',
        admin_user_ids: []
      });
    }
  }, [group, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const toggleAdmin = (userId) => {
    setFormData(prev => ({
      ...prev,
      admin_user_ids: prev.admin_user_ids.includes(userId)
        ? prev.admin_user_ids.filter(id => id !== userId)
        : [...prev.admin_user_ids, userId]
    }));
  };

  const selectedAdmins = users.filter(u => formData.admin_user_ids.includes(u.id));
  const availableUsers = users.filter(u => !formData.admin_user_ids.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit ARES Group' : 'Create ARES Group'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Group Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., North County ARES"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              placeholder="e.g., Northern California"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this ARES group"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Group Admins</Label>
            <p className="text-xs text-slate-500 mb-2">
              Select 1-2 users who will be admins for this ARES group
            </p>
            
            {selectedAdmins.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedAdmins.map(admin => (
                  <Badge
                    key={admin.id}
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200 cursor-pointer"
                    onClick={() => toggleAdmin(admin.id)}
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    {admin.call_sign || admin.full_name}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {availableUsers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No more users available</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {availableUsers.map(user => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleAdmin(user.id)}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                        {user.call_sign && (
                          <p className="text-xs text-slate-500">{user.call_sign}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {user.app_role || 'user'}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {group ? 'Update' : 'Create'} Group
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}