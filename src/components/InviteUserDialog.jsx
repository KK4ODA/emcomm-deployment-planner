import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Mail, Shield, Users, X } from "lucide-react";
import { ROLES, getRoleLabel, getRoleDescription } from "@/components/permissions.jsx";
import { validateEmail } from '@/components/utils/callsignValidation';
import { toast } from 'sonner';

export default function InviteUserDialog({ open, onClose, onInvite, currentUserRole }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES.PENDING);
  const [aresGroupIds, setAresGroupIds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const { data: aresGroups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => base44.entities.ARESGroup.list('name'),
    enabled: open
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const emailValidation = validateEmail(email);
    
    if (!emailValidation.isValid) {
      setErrors({ email: emailValidation.error });
      toast.error('Please enter a valid email address');
      return;
    }
    
    if (aresGroupIds.length === 0) {
      toast.error('Please select at least one ARES group');
      return;
    }

    setIsSubmitting(true);
    try {
      await onInvite({ email, role, aresGroupIds });
      setEmail('');
      setRole(ROLES.PENDING);
      setAresGroupIds([]);
      setErrors({});
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAresGroup = (groupId) => {
    setAresGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const selectedGroups = aresGroups.filter(g => aresGroupIds.includes(g.id));
  const availableGroups = aresGroups.filter(g => !aresGroupIds.includes(g.id));

  // Only admins can invite as admin
  const availableRoles = currentUserRole === ROLES.ADMIN 
    ? [ROLES.PENDING, ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]
    : [ROLES.PENDING, ROLES.VIEWER];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite New User
          </DialogTitle>
          <DialogDescription>
            Send an invitation to a new ham radio operator. They'll receive an email to create their account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="operator@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors({ ...errors, email: null });
                }}
                className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                required
              />
            </div>
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Initial Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map(r => (
                  <SelectItem key={r} value={r}>
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3" />
                      <span>{getRoleLabel(r)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {getRoleDescription(role)}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              ARES Groups *
            </Label>
            <p className="text-xs text-slate-500 mb-2">
              Select which ARES groups the user will have access to
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

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>Recommendation:</strong> Start new users with "Pending Approval" status. Admins can upgrade their role after verifying their ham radio license.
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!email || aresGroupIds.length === 0 || isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}