import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RoleBadge } from '@/components/common/Badges';
import { ROLE_ORDER, getRoleDescription } from '@/lib/permissions';

/** @param {{ open: boolean, onClose: () => void, member: Object|null, onChange: (role: string) => void, submitting?: boolean }} props */
export function RoleDialog({ open, onClose, member, onChange, submitting }) {
  const [role, setRole] = useState(member?.app_role || 'viewer');
  useEffect(() => { if (open) setRole(member?.app_role || 'viewer'); }, [open, member]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>{member?.full_name || member?.email}</DialogDescription>
        </DialogHeader>
        <RadioGroup value={role} onValueChange={setRole} className="gap-2">
          {ROLE_ORDER.map(r => (
            <Label key={r} htmlFor={`role-${r}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value={r} id={`role-${r}`} className="mt-0.5" />
              <span className="space-y-1">
                <RoleBadge role={r} />
                <span className="block text-xs font-normal text-muted-foreground">{getRoleDescription(r)}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onChange(role)} loading={submitting} disabled={role === member?.app_role}>Update role</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
