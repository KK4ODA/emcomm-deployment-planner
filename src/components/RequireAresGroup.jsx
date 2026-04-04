import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function RequireAresGroup({ user, onComplete }) {
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data: aresGroups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => base44.entities.ARESGroup.list('name')
  });

  const toggleGroup = (groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSave = async () => {
    if (selectedGroups.length === 0) {
      toast.error('Please select at least one ARES group');
      return;
    }

    setSaving(true);
    try {
      await base44.auth.updateMe({ ares_group_ids: selectedGroups });
      toast.success('ARES groups saved successfully');
      onComplete();
    } catch (error) {
      toast.error('Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedGroupObjs = aresGroups.filter(g => selectedGroups.includes(g.id));
  const availableGroups = aresGroups.filter(g => !selectedGroups.includes(g.id));

  // Don't show if user already has groups, is admin, or no groups exist yet
  if (user?.ares_group_ids?.length > 0 || user?.app_role === 'admin' || aresGroups.length === 0) {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <AlertCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle>Select Your ARES Groups</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                Please select which ARES groups you belong to before continuing
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {aresGroups.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 mb-2">No ARES groups available yet</p>
              <p className="text-sm text-slate-500">Please contact an administrator</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" />
                  Select ARES Groups *
                </Label>
                
                {selectedGroupObjs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedGroupObjs.map(group => (
                      <Badge
                        key={group.id}
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200 cursor-pointer"
                        onClick={() => toggleGroup(group.id)}
                      >
                        <Users className="h-3 w-3 mr-1" />
                        {group.name}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                  {availableGroups.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      All groups selected
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {availableGroups.map(group => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
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

              <Button
                onClick={handleSave}
                className="w-full bg-slate-900 hover:bg-slate-800"
                disabled={selectedGroups.length === 0 || saving}
              >
                {saving ? 'Saving...' : 'Continue'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}