import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Radio, Package, Users, ChevronDown, ChevronRight, MapPin, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import CategoryCard from "@/components/CategoryCard";
import ItemRow from "@/components/ItemRow";
import CategoryForm from "@/components/CategoryForm";
import ItemForm from "@/components/ItemForm";
import LandscapeNotice from "@/components/LandscapeNotice";
import { canCreate, canEdit, canDelete, hasPermission } from "@/components/permissions.jsx";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [currentDeploymentId, setCurrentDeploymentId] = useState(
    localStorage.getItem('currentDeploymentId') || null
  );
  const [currentLocationId, setCurrentLocationId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('location') || localStorage.getItem('currentLocationId') || null;
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order')
  });

  // Real-time updates for categories and items
  useEffect(() => {
    const unsubscribeCategories = base44.entities.Category.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    });
    const unsubscribeItems = base44.entities.DeploymentItem.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    });
    return () => {
      unsubscribeCategories();
      unsubscribeItems();
    };
  }, [queryClient]);

  const { data: allItems = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => base44.entities.DeploymentItem.list('sort_order')
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.DeploymentLocation.list('sort_order')
  });

  const { data: allDeployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => base44.entities.Deployment.list()
  });

  const { data: currentDeployment } = useQuery({
    queryKey: ['deployment', currentDeploymentId],
    queryFn: () => currentDeploymentId ? base44.entities.Deployment.filter({ id: currentDeploymentId }).then(d => d[0]) : null,
    enabled: !!currentDeploymentId
  });

  // Check if user has access to current deployment
  const hasAccessToDeployment = currentDeployment && (
    user?.app_role === 'admin' ||
    user?.ares_group_ids?.includes(currentDeployment.ares_group_id)
  );

  // Filter by deployment and location
  const categories = allCategories.filter(c => c.deployment_id === currentDeploymentId);
  const locations = allLocations.filter(l => l.deployment_id === currentDeploymentId);
  const items = allItems.filter(i => {
    if (currentLocationId) {
      return i.deployment_location_id === currentLocationId;
    }
    return locations.some(loc => loc.id === i.deployment_location_id);
  });

  const userRole = user?.app_role;
  const canCreateCategory = canCreate(userRole, 'category');
  const canEditCategory = canEdit(userRole, 'category');
  const canDeleteCategory = canDelete(userRole, 'category');
  const canCreateItem = canCreate(userRole, 'item');
  const canEditItem = canEdit(userRole, 'item');
  const canDeleteItem = canDelete(userRole, 'item');
  const canAssignItem = hasPermission(userRole, 'ASSIGN_ITEM');

  // Category mutations
  const createCategory = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      setCategoryFormOpen(false);
    }
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      setCategoryFormOpen(false);
      setEditingCategory(null);
    }
  });

  const deleteCategory = useMutation({
    mutationFn: (id) => base44.entities.Category.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['categories'])
  });

  // Item mutations
  const createItem = useMutation({
    mutationFn: (data) => base44.entities.DeploymentItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['items']);
      setItemFormOpen(false);
    }
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DeploymentItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['items']);
      setItemFormOpen(false);
      setEditingItem(null);
    }
  });

  const deleteItem = useMutation({
    mutationFn: (id) => base44.entities.DeploymentItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['items'])
  });

  const duplicateItem = useMutation({
    mutationFn: (item) => {
      const { id, created_date, updated_date, created_by, ...itemData } = item;
      return base44.entities.DeploymentItem.create({
        ...itemData,
        name: `${itemData.name} (Copy)`,
        assigned_to: []
      });
    },
    onSuccess: () => queryClient.invalidateQueries(['items'])
  });

  const handleCategorySubmit = (data) => {
    const dataWithDeployment = { ...data, deployment_id: currentDeploymentId };
    if (editingCategory) {
      updateCategory.mutate({ id: editingCategory.id, data: dataWithDeployment });
    } else {
      createCategory.mutate(dataWithDeployment);
    }
  };

  const handleItemSubmit = (data) => {
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data });
    } else {
      createItem.mutate(data);
    }
  };

  const handleLocationChange = (locationId) => {
    setCurrentLocationId(locationId);
    if (locationId) {
      localStorage.setItem('currentLocationId', locationId);
      window.history.pushState({}, '', `?location=${locationId}`);
    } else {
      localStorage.removeItem('currentLocationId');
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const handleAssign = (item, callSign) => {
    const currentAssignments = Array.isArray(item.assigned_to) ? item.assigned_to : (item.assigned_to ? [item.assigned_to] : []);
    
    let newAssignments;
    if (currentAssignments.includes(callSign)) {
      // Remove if already assigned
      newAssignments = currentAssignments.filter(cs => cs !== callSign);
    } else {
      // Add if not assigned
      newAssignments = [...currentAssignments, callSign];
    }
    
    updateItem.mutate({ id: item.id, data: { ...item, assigned_to: newAssignments } });
  };

  const handleDragEnd = (result) => {
    setIsDragging(false);
    
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (source.index === destination.index && source.droppableId === destination.droppableId) return;

    if (type === 'CATEGORY') {
      // Reorder categories
      const reorderedCategories = Array.from(categories);
      const [removed] = reorderedCategories.splice(source.index, 1);
      reorderedCategories.splice(destination.index, 0, removed);

      // Optimistically update the cache
      const updatedCategories = reorderedCategories.map((cat, index) => ({
        ...cat,
        sort_order: index
      }));

      queryClient.setQueryData(['categories'], (oldData) => {
        return oldData.map(cat => {
          const updated = updatedCategories.find(c => c.id === cat.id);
          return updated || cat;
        });
      });

      // Update on server
      updatedCategories.forEach((category) => {
        updateCategory.mutate({ id: category.id, data: { ...category, sort_order: category.sort_order } }, {
          onSuccess: () => {
            // Don't invalidate on each update
          }
        });
      });
    } else if (type === 'ITEM') {
      // Reorder items within a category
      const categoryId = source.droppableId;
      const categoryItems = getItemsByCategory(categoryId);
      const reorderedItems = Array.from(categoryItems);
      const [removed] = reorderedItems.splice(source.index, 1);
      reorderedItems.splice(destination.index, 0, removed);

      // Optimistically update the cache
      const updatedItems = reorderedItems.map((item, index) => ({
        ...item,
        sort_order: index
      }));

      queryClient.setQueryData(['items'], (oldData) => {
        return oldData.map(item => {
          const updated = updatedItems.find(i => i.id === item.id);
          return updated || item;
        });
      });

      // Update on server
      updatedItems.forEach((item) => {
        updateItem.mutate({ id: item.id, data: { ...item, sort_order: item.sort_order } }, {
          onSuccess: () => {
            // Don't invalidate on each update
          }
        });
      });
    }
  };



  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const filteredItems = items.filter(item => {
    const assignedCallSigns = Array.isArray(item.assigned_to) ? item.assigned_to : (item.assigned_to ? [item.assigned_to] : []);
    return item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignedCallSigns.some(cs => cs?.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const getItemsByCategory = (categoryId) => {
    return filteredItems
      .filter(item => item.category_id === categoryId)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const usersWithCallSign = users.filter(u => u.call_sign);

  const scrollToFirstUnassigned = (locationId = null) => {
    // First, find which category contains the first unassigned item
    let unassignedItems = filteredItems.filter(i => !i.assigned_to || (Array.isArray(i.assigned_to) && i.assigned_to.length === 0));
    
    // Filter by location if specified
    if (locationId) {
      unassignedItems = unassignedItems.filter(i => i.deployment_location_id === locationId);
    }
    
    if (unassignedItems.length === 0) return;
    
    const firstUnassignedItem = unassignedItems[0];
    const categoryId = firstUnassignedItem.category_id;
    
    // Expand the category if it's collapsed
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: true
    }));
    
    // Wait for the expansion animation, then scroll
    setTimeout(() => {
      const firstUnassigned = locationId 
        ? document.querySelector(`[data-unassigned="true"][data-location="${locationId}"]`)
        : document.querySelector('[data-unassigned="true"]');
      
      if (firstUnassigned) {
        firstUnassigned.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstUnassigned.classList.add('ring-2', 'ring-rose-400', 'ring-offset-2');
        setTimeout(() => {
          firstUnassigned.classList.remove('ring-2', 'ring-rose-400', 'ring-offset-2');
        }, 2000);
      }
    }, 250);
  };

  if (!currentDeploymentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-100 p-12">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">No Deployment Selected</h2>
            <p className="text-slate-500 mb-6">
              Please select a deployment from the dropdown above or create a new one.
            </p>
            <Link to={createPageUrl('Deployments')}>
              <Button className="bg-slate-900 hover:bg-slate-800">
                Go to Deployments
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (currentDeployment && !hasAccessToDeployment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-100 p-12">
            <Package className="h-16 w-16 text-rose-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-500 mb-6">
              You don't have access to this deployment. It belongs to a different ARES group.
            </p>
            <Link to={createPageUrl('Deployments')}>
              <Button className="bg-slate-900 hover:bg-slate-800">
                Go to Deployments
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <LandscapeNotice />
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        {/* Header */}
        <div className="mb-3 sm:mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-900 rounded-lg">
                <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{currentDeployment?.name || 'Dashboard'}</h1>
                {currentDeployment?.location && (
                  <p className="text-xs sm:text-sm text-slate-500">{currentDeployment.location}</p>
                )}
              </div>
            </div>
            {locations.length > 0 && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                <Select value={currentLocationId || 'all'} onValueChange={(val) => handleLocationChange(val === 'all' ? null : val)}>
                  <SelectTrigger className="w-full sm:w-56 bg-white">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="bg-white rounded-lg p-2 sm:p-3 border border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1 sm:p-1.5 bg-sky-100 rounded">
                <Package className="h-3 w-3 sm:h-4 sm:w-4 text-sky-600" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold text-slate-900">{items.length}</p>
                <p className="text-xs text-slate-500">Items</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-2 sm:p-3 border border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1 sm:p-1.5 bg-emerald-100 rounded">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold text-slate-900">{usersWithCallSign.length}</p>
                <p className="text-xs text-slate-500">Members</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-2 sm:p-3 border border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1 sm:p-1.5 bg-amber-100 rounded">
                <Package className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold text-slate-900">{categories.length}</p>
                <p className="text-xs text-slate-500">Categories</p>
              </div>
            </div>
          </div>
          <button 
            onClick={scrollToFirstUnassigned}
            className="bg-white rounded-lg p-2 sm:p-3 border border-slate-100 hover:border-rose-300 hover:shadow-sm transition-all cursor-pointer w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1 sm:p-1.5 bg-rose-100 rounded">
                <Package className="h-3 w-3 sm:h-4 sm:w-4 text-rose-600" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold text-slate-900">
                  {items.filter(i => !i.assigned_to || (Array.isArray(i.assigned_to) && i.assigned_to.length === 0)).length}
                </p>
                <p className="text-xs text-slate-500">Unassigned items</p>
              </div>
            </div>
          </button>
        </div>

        {/* Unassigned Items by Location */}
        {locations.length > 0 && (
          <div className="bg-white rounded-lg p-3 sm:p-4 border border-slate-100 mb-3 sm:mb-4">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">Unassigned Items by Location</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {locations.map(location => {
                const locationItems = allItems.filter(i => i.deployment_location_id === location.id);
                const unassignedCount = locationItems.filter(i => !i.assigned_to || (Array.isArray(i.assigned_to) && i.assigned_to.length === 0)).length;
                return (
                  <button 
                    key={location.id} 
                    onClick={() => unassignedCount > 0 && scrollToFirstUnassigned(location.id)}
                    className={`flex items-center justify-between p-2 rounded bg-slate-50 w-full text-left transition-all ${
                      unassignedCount > 0 ? 'hover:bg-slate-100 cursor-pointer hover:shadow-sm' : 'cursor-default'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-700">{location.name}</span>
                    </div>
                    <Badge variant={unassignedCount > 0 ? "destructive" : "secondary"} className="text-xs">
                      {unassignedCount} items unassigned
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search items or call signs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-slate-200"
            />
          </div>
          {(canCreateCategory || canCreateItem) && (
            <div className="flex gap-2">
              {canCreateCategory && (
                <Button
                  onClick={() => { setEditingCategory(null); setCategoryFormOpen(true); }}
                  variant="outline"
                  className="gap-2 text-sm sm:text-base"
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Category</span>
                  <span className="sm:hidden">Category</span>
                </Button>
              )}
              {canCreateItem && (
                <Button
                  onClick={() => { setEditingItem(null); setItemFormOpen(true); }}
                  className="gap-2 bg-slate-900 hover:bg-slate-800 text-sm sm:text-base"
                  disabled={categories.length === 0}
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Item</span>
                  <span className="sm:hidden">Item</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Categories and Items */}
        {categories.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
            <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No categories yet</h3>
            <p className="text-slate-500 mb-4">
              {canCreateCategory ? 'Start by creating equipment categories' : 'Waiting for a leader or operator to set up categories'}
            </p>
            {canCreateCategory && (
              <Button onClick={() => setCategoryFormOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                <Plus className="h-4 w-4 mr-2" />
                Create First Category
              </Button>
            )}
          </div>
        ) : (
          <DragDropContext 
            onDragEnd={handleDragEnd}
            onDragStart={() => setIsDragging(true)}
          >
            <Droppable droppableId="categories" type="CATEGORY">
              {(provided) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  className="space-y-3"
                >
                  {categories.map((category, index) => {
                    const categoryItems = getItemsByCategory(category.id);
                    const isExpanded = expandedCategories[category.id] !== false;

                    return (
                      <Draggable key={category.id} draggableId={category.id} index={index} type="CATEGORY" isDragDisabled={!canEditCategory}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`bg-white rounded-lg border border-slate-100 overflow-hidden ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                          >
                            <button
                              onClick={() => toggleCategory(category.id)}
                              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {canEditCategory && (
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                    <GripVertical className="h-4 w-4 text-slate-400" />
                                  </div>
                                )}
                                <div className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: 
                                    category.color === 'amber' ? '#f59e0b' :
                                    category.color === 'emerald' ? '#10b981' :
                                    category.color === 'sky' ? '#0ea5e9' :
                                    category.color === 'rose' ? '#f43f5e' :
                                    category.color === 'violet' ? '#8b5cf6' :
                                    category.color === 'orange' ? '#f97316' :
                                    '#64748b'
                                  }} />
                                <div className="text-left">
                                  <h3 className="font-medium text-slate-900 text-sm">{category.name}</h3>
                                </div>
                                <span className="text-xs text-slate-400 ml-2">
                                  {categoryItems.length} item{categoryItems.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {(canEditCategory || canDeleteCategory) && (
                                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                    {canEditCategory && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { setEditingCategory(category); setCategoryFormOpen(true); }}
                                      >
                                        Edit
                                      </Button>
                                    )}
                                    {canDeleteCategory && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-rose-600 hover:text-rose-700"
                                        onClick={() => {
                                          if (confirm('Delete this category and all its items?')) {
                                            deleteCategory.mutate(category.id);
                                          }
                                        }}
                                      >
                                        Delete
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="h-5 w-5 text-slate-400" />
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-slate-400" />
                                )}
                              </div>
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="border-t border-slate-100"
                                >
                                  {categoryItems.length === 0 ? (
                                    <p className="text-center text-slate-400 py-4">
                                      No items in this category
                                    </p>
                                  ) : (
                                    <Droppable droppableId={category.id} type="ITEM">
                                      {(provided) => (
                                        <div 
                                          {...provided.droppableProps} 
                                          ref={provided.innerRef}
                                          className="p-3 space-y-2"
                                        >
                                          {categoryItems.map((item, itemIndex) => (
                                            <Draggable 
                                              key={item.id} 
                                              draggableId={item.id} 
                                              index={itemIndex}
                                              type="ITEM"
                                              isDragDisabled={!canEditItem}
                                            >
                                              {(provided, snapshot) => (
                                                <div
                                                  ref={provided.innerRef}
                                                  {...provided.draggableProps}
                                                >
                                                  <div 
                                                    data-unassigned={!item.assigned_to || (Array.isArray(item.assigned_to) && item.assigned_to.length === 0) ? "true" : "false"}
                                                    data-location={item.deployment_location_id}
                                                  >
                                                    <ItemRow
                                                      item={item}
                                                      users={usersWithCallSign}
                                                      canEdit={canEditItem}
                                                      canDelete={canDeleteItem}
                                                      canAssign={canAssignItem}
                                                      currentUserCallSign={user?.call_sign}
                                                      onEdit={(item) => { setEditingItem(item); setItemFormOpen(true); }}
                                                      onDelete={(item) => {
                                                        if (confirm('Delete this item?')) {
                                                          deleteItem.mutate(item.id);
                                                        }
                                                      }}
                                                      onDuplicate={(item) => duplicateItem.mutate(item)}
                                                      onAssign={handleAssign}
                                                      dragHandleProps={provided.dragHandleProps}
                                                      isDragging={snapshot.isDragging}
                                                    />
                                                  </div>
                                                </div>
                                              )}
                                            </Draggable>
                                          ))}
                                          {provided.placeholder}
                                        </div>
                                      )}
                                    </Droppable>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {/* Forms */}
        <CategoryForm
          open={categoryFormOpen}
          onClose={() => { setCategoryFormOpen(false); setEditingCategory(null); }}
          onSubmit={handleCategorySubmit}
          category={editingCategory}
        />

        <ItemForm
          open={itemFormOpen}
          onClose={() => { setItemFormOpen(false); setEditingItem(null); }}
          onSubmit={handleItemSubmit}
          item={editingItem}
          categories={categories}
          locations={locations}
          users={usersWithCallSign}
          allItems={allItems}
        />
      </div>
    </div>
  );
}