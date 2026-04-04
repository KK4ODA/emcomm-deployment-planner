import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Shield, User, Settings } from 'lucide-react';
import { ROLES, getRoleLabel, getRoleDescription } from './permissions';

export default function RoleChangeDialog({ open, onClose, user, onRoleChange }) {
  const [selectedRole, setSelectedRole] = useState(user?.app_role || ROLES.VIEWER);

  const handleSubmit = () => {
    onRoleChange(user.id, selectedRole);
    onClose();
  };

  const roleIcons = {
    [ROLES.ADMIN]: Shield,
    [ROLES.OPERATOR]: Settings,
    [ROLES.VIEWER]: User
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change User Role</DialogTitle>
          <DialogDescription>
            Update role for {user?.full_name}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedRole} onValueChange={setSelectedRole} className="space-y-4 mt-4">
          {Object.values(ROLES).map(role => {
            const Icon = roleIcons[role];
            return (
              <div key={role} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value={role} id={role} />
                <Label htmlFor={role} className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-slate-600" />
                    <span className="font-semibold">{getRoleLabel(role)}</span>
                  </div>
                  <p className="text-sm text-slate-500">{getRoleDescription(role)}</p>
                </Label>
              </div>
            );
          })}
        </RadioGroup>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-slate-900 hover:bg-slate-800">
            Update Role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}