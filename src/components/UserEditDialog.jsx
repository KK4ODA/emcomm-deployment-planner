import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Radio, Phone, Mail, Users, X } from "lucide-react";
import { validateCallsign, validateEmail } from '@/components/utils/callsignValidation';

export default function UserEditDialog({ open, onClose, user, onSave }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    call_sign: '',
    phone: '',
    aprs_call_sign: '',
    ares_group_ids: []
  });
  const [errors, setErrors] = useState({});

  const { data: aresGroups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => base44.entities.ARESGroup.list('name'),
    enabled: open
  });

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        email: user.email || '',
        call_sign: user.call_sign || '',
        phone: user.phone || '',
        aprs_call_sign: user.aprs_call_sign || '',
        ares_group_ids: user.ares_group_ids || []
      });
    }
  }, [user]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate email and callsigns
    const emailValidation = validateEmail(form.email);
    const callSignValidation = validateCallsign(form.call_sign);
    const aprsValidation = validateCallsign(form.aprs_call_sign);
    
    const newErrors = {};
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.error;
    }
    if (!callSignValidation.isValid) {
      newErrors.call_sign = callSignValidation.error;
    }
    if (!aprsValidation.isValid) {
      newErrors.aprs_call_sign = aprsValidation.error;
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      return;
    }
    
    onSave(form);
  };

  const toggleAresGroup = (groupId) => {
    setForm(prev => ({
      ...prev,
      ares_group_ids: prev.ares_group_ids.includes(groupId)
        ? prev.ares_group_ids.filter(id => id !== groupId)
        : [...prev.ares_group_ids, groupId]
    }));
  };

  const selectedGroups = aresGroups.filter(g => form.ares_group_ids.includes(g.id));
  const availableGroups = aresGroups.filter(g => !form.ares_group_ids.includes(g.id));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User Profile</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-500" />
              Email
            </Label>
            <Input
              id="edit_email"
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                setErrors({ ...errors, email: null });
              }}
              className={errors.email ? 'border-red-500' : ''}
              required
            />
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_full_name" className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              Full Name
            </Label>
            <Input
              id="edit_full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_call_sign" className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-slate-500" />
              Call Sign
            </Label>
            <Input
              id="edit_call_sign"
              value={form.call_sign}
              onChange={(e) => {
                setForm({ ...form, call_sign: e.target.value.toUpperCase() });
                setErrors({ ...errors, call_sign: null });
              }}
              className={`uppercase font-mono ${errors.call_sign ? 'border-red-500' : ''}`}
            />
            {errors.call_sign && (
              <p className="text-sm text-red-600">{errors.call_sign}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-slate-500" />
              Phone
            </Label>
            <Input
              id="edit_phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_aprs" className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-slate-500" />
              APRS Call Sign
            </Label>
            <Input
              id="edit_aprs"
              value={form.aprs_call_sign}
              onChange={(e) => {
                setForm({ ...form, aprs_call_sign: e.target.value.toUpperCase() });
                setErrors({ ...errors, aprs_call_sign: null });
              }}
              className={`uppercase font-mono ${errors.aprs_call_sign ? 'border-red-500' : ''}`}
            />
            {errors.aprs_call_sign && (
              <p className="text-sm text-red-600">{errors.aprs_call_sign}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              ARES Groups
            </Label>
            <p className="text-xs text-slate-500 mb-2">
              Select which ARES groups the user has access to
            </p>
            
            {selectedGroups.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedGroups.map(group => (
                  <Badge
                    key={group.id}
                    variant="outline"
                    className="bg-blue-50 text-blue-700 border-blue-200 cursor-pointer"
                    onClick={() => toggleAresGroup(group.id)}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    {group.name}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
              {availableGroups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  {aresGroups.length === 0 ? 'No ARES groups available' : 'All groups selected'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {availableGroups.map(group => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleAresGroup(group.id)}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-900">{group.name}</p>
                      {group.region && (
                        <p className="text-xs text-slate-500">{group.region}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}