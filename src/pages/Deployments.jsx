import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, MapPin, Package, Pencil, Trash2, ArrowRight, Clock, Save, FileDown, FileText, CheckSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { createPageUrl } from "@/utils";
import DeploymentForm from "@/components/DeploymentForm";
import TemplateForm from "@/components/TemplateForm";
import { toast } from "sonner";
import { canCreate, canEdit, canDelete, hasPermission } from "@/components/permissions.jsx";

const statusStyles = {
  planning: "bg-blue-100 text-blue-700 border-blue-200",
  active: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  archived: "bg-amber-100 text-amber-700 border-amber-200",
};

const statusIcons = {
  planning: Clock,
  active: Package,
  completed: Package,
  archived: Package,
};

export default function Deployments() {
  const [user, setUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [savingDeploymentId, setSavingDeploymentId] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: allDeployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => base44.entities.Deployment.list('-created_date')
  });

  // Filter deployments by user's ARES groups
  const deployments = allDeployments.filter(d => {
    if (user?.app_role === 'admin') return true;
    if (!user?.ares_group_ids || user.ares_group_ids.length === 0) return false;
    return user.ares_group_ids.includes(d.ares_group_id);
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list()
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => base44.entities.DeploymentItem.list()
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.DeploymentLocation.list()
  });

  const userRole = user?.app_role;
  const canCreateDeployment = canCreate(userRole, 'deployment');
  const canEditDeployment = canEdit(userRole, 'deployment');
  const canDeleteDeployment = canDelete(userRole, 'deployment');
  const canExportDeployment = hasPermission(userRole, 'EXPORT_DEPLOYMENT');

  const createDeployment = useMutation({
    mutationFn: async (data) => {
      const deployment = await base44.entities.Deployment.create(data);
      
      // If creating from template, copy structure
      if (data.template_id) {
        const template = await base44.entities.DeploymentTemplate.filter({ id: data.template_id }).then(t => t[0]);
        if (template?.structure) {
          await applyTemplate(deployment.id, template.structure);
        }
      }
      
      return deployment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['deployments']);
      queryClient.invalidateQueries(['categories']);
      queryClient.invalidateQueries(['items']);
      queryClient.invalidateQueries(['locations']);
      setFormOpen(false);
      toast.success('Deployment created successfully');
    }
  });

  const saveAsTemplate = useMutation({
    mutationFn: async ({ deploymentId, templateData }) => {
      // Get deployment data
      const deploymentCategories = categories.filter(c => c.deployment_id === deploymentId);
      const deploymentLocations = locations.filter(l => l.deployment_id === deploymentId);
      const deploymentItems = items.filter(i => 
        deploymentLocations.some(loc => loc.id === i.deployment_location_id)
      );

      // Build structure (without IDs and assignments)
      const structure = {
        categories: deploymentCategories.map(c => ({
          name: c.name,
          color: c.color,
          description: c.description,
          sort_order: c.sort_order
        })),
        locations: deploymentLocations.map(l => ({
          name: l.name,
          description: l.description,
          address: l.address,
          contact_person: l.contact_person,
          sort_order: l.sort_order
        })),
        items: deploymentItems.map(i => ({
          name: i.name,
          description: i.description,
          category_name: deploymentCategories.find(c => c.id === i.category_id)?.name,
          location_name: deploymentLocations.find(l => l.id === i.deployment_location_id)?.name,
          quantity: i.quantity,
          priority: i.priority
        }))
      };

      return base44.entities.DeploymentTemplate.create({
        ...templateData,
        structure,
        category_count: deploymentCategories.length,
        item_count: deploymentItems.length,
        location_count: deploymentLocations.length
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setTemplateFormOpen(false);
      setSavingDeploymentId(null);
      toast.success('Template saved successfully');
    }
  });

  const applyTemplate = async (deploymentId, structure) => {
    // Create categories and build mapping
    const categoryMap = {};
    for (const cat of structure.categories || []) {
      const newCategory = await base44.entities.Category.create({
        ...cat,
        deployment_id: deploymentId
      });
      categoryMap[cat.name] = newCategory.id;
    }

    // Create locations and build mapping
    const locationMap = {};
    for (const loc of structure.locations || []) {
      const newLocation = await base44.entities.DeploymentLocation.create({
        ...loc,
        deployment_id: deploymentId
      });
      locationMap[loc.name] = newLocation.id;
    }

    // Create items
    for (const item of structure.items || []) {
      await base44.entities.DeploymentItem.create({
        name: item.name,
        description: item.description,
        category_id: categoryMap[item.category_name],
        deployment_location_id: locationMap[item.location_name],
        quantity: item.quantity,
        priority: item.priority
      });
    }
  };

  const updateDeployment = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Deployment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['deployments']);
      setFormOpen(false);
      setEditingDeployment(null);
      toast.success('Deployment updated successfully');
    }
  });

  const deleteDeployment = useMutation({
    mutationFn: (id) => base44.entities.Deployment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deployments']);
      toast.success('Deployment deleted successfully');
    }
  });



  const handleSubmit = (data) => {
    if (editingDeployment) {
      updateDeployment.mutate({ id: editingDeployment.id, data });
    } else {
      createDeployment.mutate(data);
    }
  };

  const handleSelectDeployment = (deploymentId) => {
    localStorage.setItem('currentDeploymentId', deploymentId);
    window.location.href = createPageUrl('Dashboard');
  };

  const handleSaveAsTemplate = (deploymentId) => {
    setSavingDeploymentId(deploymentId);
    setTemplateFormOpen(true);
  };

  const handleTemplateSubmit = (templateData) => {
    saveAsTemplate.mutate({
      deploymentId: savingDeploymentId,
      templateData
    });
  };

  const handleExportDeployment = async (deploymentId, format = 'txt', includeGoKit = true) => {
    try {
      const deployment = deployments.find(d => d.id === deploymentId);
      const response = await base44.functions.invoke('exportDeployment', { deploymentId, format, includeGoKit });
      
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/plain';
      const extension = format === 'pdf' ? 'pdf' : 'txt';
      
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const filename = `${deployment.name.replace(/[^a-z0-9]/gi, '_')}_${now.toISOString().replace(/:/g, '-').replace(/\..+/, '')}.${extension}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success(`Deployment exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to export deployment');
    }
  };

  const getDeploymentStats = (deploymentId) => {
    const deploymentLocations = locations.filter(l => l.deployment_id === deploymentId);
    const deploymentCategories = categories.filter(c => c.deployment_id === deploymentId);
    const deploymentItems = items.filter(i => 
      deploymentLocations.some(loc => loc.id === i.deployment_location_id)
    );
    const assignedItems = deploymentItems.filter(i => 
      i.assigned_to && (Array.isArray(i.assigned_to) ? i.assigned_to.length > 0 : true)
    );
    const usersWithCallSign = users.filter(u => u.call_sign);

    return {
      categories: deploymentCategories.length,
      items: deploymentItems.length,
      assigned: assignedItems.length,
      members: usersWithCallSign.length
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Deployments</h1>
            <p className="text-slate-500">Manage and organize multiple deployment operations</p>
          </div>
          {canCreateDeployment && (
            <Button
              onClick={() => { setEditingDeployment(null); setFormOpen(true); }}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Deployment
            </Button>
          )}
        </div>

        {deployments.length === 0 ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No deployments yet</h3>
              <p className="text-slate-500 mb-4">
                {canCreateDeployment ? 'Create your first deployment to get started' : 'Waiting for an admin to create one'}
              </p>
              {canCreateDeployment && (
                <Button onClick={() => setFormOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Deployment
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {deployments.map((deployment, index) => {
              const stats = getDeploymentStats(deployment.id);
              const StatusIcon = statusIcons[deployment.status];

              return (
                <motion.div
                  key={deployment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="border-slate-100 hover:shadow-lg transition-all duration-300">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-xl">{deployment.name}</CardTitle>
                            <Badge variant="outline" className={`${statusStyles[deployment.status]} border`}>
                              {deployment.status}
                            </Badge>
                          </div>
                          {deployment.location && (
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                              <MapPin className="h-4 w-4" />
                              {deployment.location}
                            </div>
                          )}
                          {deployment.start_date && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(deployment.start_date), 'MMM d, yyyy')}
                              {deployment.end_date && ` - ${format(new Date(deployment.end_date), 'MMM d, yyyy')}`}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {canExportDeployment && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Export deployment"
                                >
                                  <FileDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleExportDeployment(deployment.id, 'txt', true)}>
                                  <FileText className="h-4 w-4 mr-2" />
                                  TXT (with Go-Kit)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportDeployment(deployment.id, 'txt', false)}>
                                  <FileText className="h-4 w-4 mr-2" />
                                  TXT (without Go-Kit)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportDeployment(deployment.id, 'pdf', true)}>
                                  <FileDown className="h-4 w-4 mr-2" />
                                  PDF (with Go-Kit)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportDeployment(deployment.id, 'pdf', false)}>
                                  <FileDown className="h-4 w-4 mr-2" />
                                  PDF (without Go-Kit)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {canCreateDeployment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSaveAsTemplate(deployment.id)}
                              title="Save as template"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                          )}
                          {canEditDeployment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => { setEditingDeployment(deployment); setFormOpen(true); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteDeployment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:text-rose-700"
                              onClick={() => {
                                if (confirm('Delete this deployment? This will also delete all associated categories and items.')) {
                                  deleteDeployment.mutate(deployment.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {deployment.description && (
                        <p className="text-sm text-slate-600 mb-4">{deployment.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-slate-900">{stats.categories}</div>
                          <div className="text-xs text-slate-500">Categories</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-slate-900">{stats.items}</div>
                          <div className="text-xs text-slate-500">Items</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-slate-900">{stats.assigned}</div>
                          <div className="text-xs text-slate-500">Assigned</div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-slate-900">{stats.members}</div>
                          <div className="text-xs text-slate-500">Members</div>
                        </div>
                      </div>

                      <Button
                        className="w-full bg-slate-900 hover:bg-slate-800"
                        onClick={() => handleSelectDeployment(deployment.id)}
                      >
                        Open Deployment
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <DeploymentForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditingDeployment(null); }}
          onSubmit={handleSubmit}
          deployment={editingDeployment}
        />

        <TemplateForm
          open={templateFormOpen}
          onClose={() => {
            setTemplateFormOpen(false);
            setSavingDeploymentId(null);
          }}
          onSubmit={handleTemplateSubmit}
        />
      </div>
    </div>
  );
}