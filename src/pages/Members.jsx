import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, User, Radio, Phone, Mail, Package, ArrowLeft, Shield, Eye, Settings as SettingsIcon, Edit, Settings, Trash2, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { hasPermission, getRoleLabel, ROLES } from "@/components/permissions.jsx";
import RoleChangeDialog from "@/components/RoleChangeDialog";
import UserEditDialog from "@/components/UserEditDialog";
import InviteUserDialog from "@/components/InviteUserDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function Members() {
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 0,
    gcTime: 0
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => base44.entities.DeploymentItem.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.DeploymentLocation.list()
  });

  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => base44.entities.Deployment.list()
  });

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.call_sign?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canManageUsers = hasPermission(user?.app_role || user?.role, 'MANAGE_USERS');
  const canInviteUsers = hasPermission(user?.app_role || user?.role, 'INVITE_USERS');

  const changeRole = useMutation({
    mutationFn: ({ userId, role }) => base44.entities.User.update(userId, { app_role: role }),
    onSuccess: async () => {
      await refetchUsers();
      toast.success('User role updated successfully');
      setRoleDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update user role');
    }
  });

  const handleRoleChange = (userId, newRole) => {
    changeRole.mutate({ userId, role: newRole });
  };

  const updateProfile = useMutation({
    mutationFn: (profileData) => base44.functions.invoke('createOrUpdateUserProfile', profileData),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('User profile updated successfully');
      setEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update user profile');
    }
  });

  const handleProfileSave = (profileData) => {
    updateProfile.mutate(profileData);
  };

  const deleteUser = useMutation({
    mutationFn: async (userId) => {
      const userToDelete = users.find(u => u.id === userId);
      if (userToDelete?.call_sign) {
        await base44.functions.invoke('cleanupDeletedUser', {
          event: { type: 'delete' },
          old_data: { call_sign: userToDelete.call_sign }
        });
      }
      return base44.entities.User.delete(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['items']);
      queryClient.invalidateQueries(['locations']);
      queryClient.invalidateQueries(['tasks']);
      toast.success('User deleted and references cleaned up');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete user');
    }
  });

  const handleDeleteUser = (userId) => {
    if (confirm('Are you sure you want to delete this user? All their assignments will be removed.')) {
      deleteUser.mutate(userId);
    }
  };

  const inviteUser = useMutation({
    mutationFn: async ({ email, role, aresGroupIds }) => {
      // First invite the user
      await base44.users.inviteUser(email, role);
      
      // Then update their ARES group membership
      // We need to find the user by email and update them
      const users = await base44.entities.User.list();
      const newUser = users.find(u => u.email === email);
      if (newUser) {
        await base44.entities.User.update(newUser.id, { ares_group_ids: aresGroupIds });
      }
    },
    onSuccess: () => {
      toast.success('Invitation sent successfully');
      setInviteDialogOpen(false);
      queryClient.invalidateQueries(['users']);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send invitation');
    }
  });

  const handleInvite = (inviteData) => {
    inviteUser.mutate(inviteData);
  };

  const getRoleIcon = (role) => {
    const icons = {
      admin: Shield,
      operator: Settings,
      viewer: User,
      pending: Eye
    };
    return icons[role] || User;
  };

  const getAssignedItemsByDeployment = (callSign) => {
    const userItems = items.filter(item => item.assigned_to === callSign);
    const itemsByDeployment = {};
    
    userItems.forEach(item => {
      const location = locations.find(loc => loc.id === item.deployment_location_id);
      if (location) {
        const deployment = deployments.find(d => d.id === location.deployment_id);
        if (deployment) {
          if (!itemsByDeployment[deployment.id]) {
            itemsByDeployment[deployment.id] = {
              deployment,
              items: []
            };
          }
          itemsByDeployment[deployment.id].items.push(item);
        }
      }
    });
    
    return itemsByDeployment;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link 
          to={createPageUrl('Dashboard')} 
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Team Members</h1>
            <p className="text-slate-500">View all registered members and their assignments</p>
          </div>
          {canInviteUsers && (
            <Button
              onClick={() => setInviteDialogOpen(true)}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          )}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, call sign, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-slate-200"
          />
        </div>

        <div className="grid gap-4">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
              <User className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No members found</h3>
              <p className="text-slate-500">
                {searchQuery ? 'Try a different search term' : 'No members have registered yet'}
              </p>
            </div>
          ) : (
            filteredUsers.map((member, index) => {
              const itemsByDeployment = getAssignedItemsByDeployment(member.call_sign);
              const totalItems = Object.values(itemsByDeployment).reduce((sum, d) => sum + d.items.length, 0);
              
              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="border-slate-100 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-slate-800 to-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-semibold">
                              {member.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-slate-900">{member.full_name}</h3>
                              <Badge 
                               variant="outline" 
                               className={`text-xs cursor-pointer ${
                                 member.app_role === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                 member.app_role === 'operator' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                 member.app_role === 'pending' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                 'bg-slate-50 text-slate-700 border-slate-200'
                               }`}
                                onClick={() => {
                                  if (canManageUsers) {
                                    setSelectedUser(member);
                                    setRoleDialogOpen(true);
                                  }
                                }}
                                title={canManageUsers ? 'Click to change role' : ''}
                              >
                                {React.createElement(getRoleIcon(member.app_role), { className: "h-3 w-3 mr-1" })}
                                {getRoleLabel(member.app_role)}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                              {member.call_sign && (
                                <span className="flex items-center gap-1.5 font-mono bg-slate-100 px-2 py-0.5 rounded">
                                  <Radio className="h-3.5 w-3.5" />
                                  {member.call_sign}
                                </span>
                              )}
                              <span className="flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5" />
                                {member.email}
                              </span>
                              {member.phone && (
                                <span className="flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5" />
                                  {member.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 sm:ml-auto">
                          {canManageUsers && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(member);
                                  setEditDialogOpen(true);
                                }}
                                className="gap-2"
                              >
                                <Edit className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(member);
                                  setRoleDialogOpen(true);
                                }}
                                className="gap-2"
                              >
                                <Shield className="h-4 w-4" />
                                Role
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(member.id)}
                                className="gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </>
                          )}
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
                            <Package className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">
                              {totalItems} item{totalItems !== 1 ? 's' : ''} assigned
                            </span>
                          </div>
                        </div>
                      </div>

                      {Object.keys(itemsByDeployment).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                          {Object.values(itemsByDeployment).map(({ deployment, items }) => (
                            <div key={deployment.id}>
                              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                                {deployment.name}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {items.map(item => (
                                  <Badge 
                                    key={item.id} 
                                    variant="secondary" 
                                    className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  >
                                    {item.name}
                                    {item.quantity > 1 && ` ×${item.quantity}`}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>

        <RoleChangeDialog
          open={roleDialogOpen}
          onClose={() => {
            setRoleDialogOpen(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          onRoleChange={handleRoleChange}
        />

        <UserEditDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          onSave={handleProfileSave}
        />

        <InviteUserDialog
          open={inviteDialogOpen}
          onClose={() => setInviteDialogOpen(false)}
          onInvite={handleInvite}
          currentUserRole={user?.app_role || user?.role}
        />
      </div>
    </div>
  );
}