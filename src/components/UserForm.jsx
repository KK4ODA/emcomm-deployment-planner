import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateCallsign } from '@/components/utils/callsignValidation';

export default function UserForm({ open, onClose, onSubmit, user }) {
  const [form, setForm] = useState({
    call_sign: '',
    phone: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (user) {
      setForm({
        call_sign: user.call_sign || '',
        phone: user.phone || ''
      });
    } else {
      setForm({ call_sign: '', phone: '' });
    }
  }, [user, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate callsign
    const validation = validateCallsign(form.call_sign);
    
    if (!validation.isValid) {
      setErrors({ call_sign: validation.error });
      return;
    }
    
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="call_sign">Call Sign</Label>
            <Input
              id="call_sign"
              value={form.call_sign}
              onChange={(e) => {
                setForm({ ...form, call_sign: e.target.value.toUpperCase() });
                setErrors({ ...errors, call_sign: null });
              }}
              placeholder="e.g., W1ABC"
              className={`uppercase ${errors.call_sign ? 'border-red-500' : ''}`}
            />
            {errors.call_sign && (
              <p className="text-sm text-red-600">{errors.call_sign}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g., (555) 123-4567"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              Save Profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}