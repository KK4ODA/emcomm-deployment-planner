import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Shield, Pencil, Trash2, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import ARESGroupForm from "@/components/ARESGroupForm";
import { toast } from "sonner";
import { hasPermission } from "@/components/permissions.jsx";

export default function ARESGroups() {
  const [user, setUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: groups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => base44.entities.ARESGroup.list('name')
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => base44.entities.Deployment.list()
  });

  const isGlobalAdmin = user?.app_role === 'admin';

  const createGroup = useMutation({
    mutationFn: (data) => base44.entities.ARESGroup.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['ares-groups']);
      setFormOpen(false);
      toast.success('ARES group created successfully');
    }
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ARESGroup.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['ares-groups']);
      setFormOpen(false);
      setEditingGroup(null);
      toast.success('ARES group updated successfully');
    }
  });

  const deleteGroup = useMutation({
    mutationFn: (id) => base44.entities.ARESGroup.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['ares-groups']);
      toast.success('ARES group deleted successfully');
    }
  });

  const handleSubmit = (data) => {
    if (editingGroup) {
      updateGroup.mutate({ id: editingGroup.id, data });
    } else {
      createGroup.mutate(data);
    }
  };

  const getUsersInGroup = (groupId) => {
    return users.filter(u => u.ares_group_ids?.includes(groupId));
  };

  const getDeploymentsInGroup = (groupId) => {
    return deployments.filter(d => d.ares_group_id === groupId);
  };

  const isGroupAdmin = (groupId) => {
    if (isGlobalAdmin) return true;
    const group = groups.find(g => g.id === groupId);
    return group?.admin_user_ids?.includes(user?.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">ARES Groups</h1>
            <p className="text-slate-500">Manage Amateur Radio Emergency Service groups and their members</p>
          </div>
          {isGlobalAdmin && (
            <Button
              onClick={() => { setEditingGroup(null); setFormOpen(true); }}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Group
            </Button>
          )}
        </div>

        {groups.length === 0 ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No ARES groups yet</h3>
              <p className="text-slate-500 mb-4">
                {isGlobalAdmin ? 'Create your first ARES group to get started' : 'Waiting for an admin to create groups'}
              </p>
              {isGlobalAdmin && (
                <Button onClick={() => setFormOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Group
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((group, index) => {
              const membersCount = getUsersInGroup(group.id).length;
              const deploymentsCount = getDeploymentsInGroup(group.id).length;
              const admins = users.filter(u => group.admin_user_ids?.includes(u.id));
              const canEdit = isGroupAdmin(group.id);

              return (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="border-slate-100 hover:shadow-lg transition-all duration-300">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl mb-2">{group.name}</CardTitle>
                          {group.region && (
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                              <MapPin className="h-4 w-4" />
                              {group.region}
                            </div>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => { setEditingGroup(group); setFormOpen(true); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {isGlobalAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-600 hover:text-rose-700"
                                onClick={() => {
                                  if (confirm('Delete this ARES group? This cannot be undone.')) {
                                    deleteGroup.mutate(group.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {group.description && (
                        <p className="text-sm text-slate-600 mb-4">{group.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-slate-900">{membersCount}</div>
                          <div className="text-xs text-slate-500">Members</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-slate-900">{deploymentsCount}</div>
                          <div className="text-xs text-slate-500">Deployments</div>
                        </div>
                      </div>

                      {admins.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                            Group Admins
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {admins.map(admin => (
                              <Badge key={admin.id} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                <Shield className="h-3 w-3 mr-1" />
                                {admin.call_sign || admin.full_name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <ARESGroupForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditingGroup(null); }}
          onSubmit={handleSubmit}
          group={editingGroup}
          users={users}
        />
      </div>
    </div>
  );
}