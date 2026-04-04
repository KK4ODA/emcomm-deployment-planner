import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, User, Package, ArrowLeft, Trash2, Edit, Map, List, ListTodo, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import LocationForm from "@/components/LocationForm";
import ICS205Form from "@/components/ICS205Form";
import { canCreate, canEdit, canDelete } from "@/components/permissions.jsx";
import LocationMap from "@/components/LocationMap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LocationsPage() {
  const [user, setUser] = useState(null);
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [ics205FormOpen, setIcs205FormOpen] = useState(false);
  const [editingIcs205, setEditingIcs205] = useState(null);
  const [selectedLocationForIcs205, setSelectedLocationForIcs205] = useState(null);
  const [what3wordsData, setWhat3wordsData] = useState({});
  const [currentDeploymentId] = useState(
    localStorage.getItem('currentDeploymentId') || null
  );

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.DeploymentLocation.list('sort_order')
  });

  // Real-time location updates
  useEffect(() => {
    const unsubscribe = base44.entities.DeploymentLocation.subscribe((event) => {
      queryClient.invalidateQueries(['locations']);
    });
    return unsubscribe;
  }, [queryClient]);

  const { data: allItems = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => base44.entities.DeploymentItem.list()
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const { data: allIcs205Forms = [] } = useQuery({
    queryKey: ['ics205forms'],
    queryFn: () => base44.entities.ICS205Form.list()
  });

  const { data: currentDeployment } = useQuery({
    queryKey: ['deployment', currentDeploymentId],
    queryFn: () => currentDeploymentId ? base44.entities.Deployment.filter({ id: currentDeploymentId }).then(d => d[0]) : null,
    enabled: !!currentDeploymentId
  });

  const hasAccessToDeployment = currentDeployment && (
    user?.app_role === 'admin' ||
    user?.ares_group_ids?.includes(currentDeployment.ares_group_id)
  );

  const locations = allLocations.filter(l => l.deployment_id === currentDeploymentId);

  // Fetch what3words for locations with coordinates (with caching)
  useEffect(() => {
    const parseCoordinates = (address) => {
      if (!address) return null;
      const coordRegex = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
      const match = address.match(coordRegex);
      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          return [lat, lon];
        }
      }
      return null;
    };

    locations.forEach(async (location) => {
      // Skip if we already have data for this location
      if (what3wordsData[location.id]) return;
      
      const coords = parseCoordinates(location.address);
      if (coords) {
        try {
          const response = await base44.functions.invoke('getWhat3Words', {
            lat: coords[0],
            lng: coords[1]
          });
          setWhat3wordsData(prev => ({
            ...prev,
            [location.id]: response.data.words
          }));
        } catch (error) {
          // Silently handle rate limit errors
          if (!error.message?.includes('Rate limit')) {
            console.error('Failed to fetch what3words:', error);
          }
        }
      }
    });
  }, [locations, what3wordsData]);
  const userRole = user?.app_role;
  const canCreateLocation = canCreate(userRole, 'location');
  const canEditLocation = canEdit(userRole, 'location');
  const canDeleteLocation = canDelete(userRole, 'location');

  const createLocation = useMutation({
    mutationFn: (data) => base44.entities.DeploymentLocation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['locations']);
      setLocationFormOpen(false);
    }
  });

  const updateLocation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DeploymentLocation.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['locations']);
      setLocationFormOpen(false);
      setEditingLocation(null);
    }
  });

  const deleteLocation = useMutation({
    mutationFn: (id) => base44.entities.DeploymentLocation.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['locations'])
  });

  const createIcs205 = useMutation({
    mutationFn: (data) => base44.entities.ICS205Form.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['ics205forms']);
      setIcs205FormOpen(false);
      setEditingIcs205(null);
      setSelectedLocationForIcs205(null);
    }
  });

  const updateIcs205 = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ICS205Form.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['ics205forms']);
      setIcs205FormOpen(false);
      setEditingIcs205(null);
      setSelectedLocationForIcs205(null);
    }
  });

  const handleSubmit = (data) => {
    const dataWithDeployment = { ...data, deployment_id: currentDeploymentId };
    if (editingLocation) {
      updateLocation.mutate({ id: editingLocation.id, data: dataWithDeployment });
    } else {
      createLocation.mutate(dataWithDeployment);
    }
  };

  const handleIcs205Submit = (data) => {
    const dataWithLocation = { ...data, deployment_location_id: selectedLocationForIcs205.id };
    if (editingIcs205) {
      updateIcs205.mutate({ id: editingIcs205.id, data: dataWithLocation });
    } else {
      createIcs205.mutate(dataWithLocation);
    }
  };

  const handleOpenIcs205 = (location) => {
    setSelectedLocationForIcs205(location);
    const existingForm = allIcs205Forms.find(f => f.deployment_location_id === location.id);
    setEditingIcs205(existingForm || null);
    setIcs205FormOpen(true);
  };

  const getLocationStats = (locationId) => {
    const locationItems = allItems.filter(i => i.deployment_location_id === locationId);
    const assignedUsers = new Set(locationItems.map(i => i.assigned_to).filter(Boolean));
    const unassignedCount = locationItems.filter(i => !i.assigned_to || (Array.isArray(i.assigned_to) && i.assigned_to.length === 0)).length;
    return {
      itemCount: locationItems.length,
      userCount: assignedUsers.size,
      unassignedCount
    };
  };

  if (!currentDeploymentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-100 p-12">
            <MapPin className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">No Deployment Selected</h2>
            <p className="text-slate-500 mb-6">
              Please select a deployment from the dropdown above.
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
            <MapPin className="h-16 w-16 text-rose-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-500 mb-6">
              You don't have access to this deployment's locations.
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link 
          to={createPageUrl('Dashboard')} 
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Deployment Locations</h1>
            <p className="text-slate-500">{currentDeployment?.name}</p>
          </div>
          {canCreateLocation && (
            <Button
              onClick={() => { setEditingLocation(null); setLocationFormOpen(true); }}
              className="gap-2 bg-slate-900 hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add Location
            </Button>
          )}
        </div>

        {locations.length === 0 ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No locations yet</h3>
              <p className="text-slate-500 mb-4">
                {canCreateLocation ? 'Start by creating deployment locations' : 'Waiting for the leader to set up locations'}
              </p>
              {canCreateLocation && (
                <Button onClick={() => setLocationFormOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Location
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                List View
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-2">
                <Map className="h-4 w-4" />
                Map View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {locations.map((location, index) => {
                  const stats = getLocationStats(location.id);
                  return (
                    <motion.div
                      key={location.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="border-slate-100 hover:shadow-md transition-shadow h-full">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="p-2 bg-slate-100 rounded-lg">
                                <MapPin className="h-5 w-5 text-slate-600" />
                              </div>
                              <div>
                                <CardTitle className="text-lg">{location.name}</CardTitle>
                                {location.description && (
                                  <p className="text-sm text-slate-500 mt-1">{location.description}</p>
                                )}
                              </div>
                            </div>
                            {(canEditLocation || canDeleteLocation) && (
                              <div className="flex gap-1">
                                {canEditLocation && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setEditingLocation(location); setLocationFormOpen(true); }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDeleteLocation && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-rose-600 hover:text-rose-700"
                                    onClick={() => {
                                      if (confirm(`Delete ${location.name}? All items at this location will also be deleted.`)) {
                                        deleteLocation.mutate(location.id);
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
                        <CardContent className="space-y-3">
                         {location.address && (
                           <div className="flex items-start gap-2 text-sm">
                             <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                             <span className="text-slate-600">{location.address}</span>
                           </div>
                         )}
                         {what3wordsData[location.id] && (
                           <div className="flex items-start gap-2 text-sm">
                             <div className="p-1 bg-rose-50 rounded">
                               <span className="text-rose-600 font-mono text-xs">
                                 ///{what3wordsData[location.id]}
                               </span>
                             </div>
                           </div>
                         )}
                         {location.contact_person && (
                           <div className="flex items-center gap-2 text-sm">
                             <User className="h-4 w-4 text-slate-400" />
                             <span className="text-slate-600">Contact: {location.contact_person}</span>
                           </div>
                         )}
                         {location.assigned_call_signs && location.assigned_call_signs.length > 0 && (
                           <div>
                             <p className="text-xs text-slate-500 mb-2">Assigned Call Signs:</p>
                             <div className="flex flex-wrap gap-1">
                               {location.assigned_call_signs.map(cs => (
                                 <Badge key={cs} variant="secondary" className="text-xs">
                                   {cs}
                                 </Badge>
                               ))}
                             </div>
                           </div>
                         )}
                         <div className="flex gap-4 pt-3 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-slate-400" />
                              <span className="text-sm text-slate-600">{stats.itemCount} items</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-slate-400" />
                              <span className="text-sm text-slate-600">{stats.userCount} assigned</span>
                            </div>
                            {stats.unassignedCount > 0 && (
                             <Badge variant="destructive" className="text-xs">
                               {stats.unassignedCount} items unassigned
                             </Badge>
                            )}
                          </div>
                          <div className="flex gap-2">
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => handleOpenIcs205(location)}
                             className="flex-1"
                           >
                             <FileText className="h-4 w-4 mr-2" />
                             {allIcs205Forms.find(f => f.deployment_location_id === location.id) ? 'Edit' : 'Create'} ICS 205
                           </Button>
                          </div>
                          <div className="flex gap-2">
                           <Link to={createPageUrl('Dashboard') + `?location=${location.id}`} className="flex-1">
                             <Button variant="outline" className="w-full">
                               <Package className="h-4 w-4 mr-2" />
                               Items
                             </Button>
                           </Link>
                           <Link to={createPageUrl('LocationTasks') + `?location=${location.id}`} className="flex-1">
                             <Button variant="outline" className="w-full">
                               <ListTodo className="h-4 w-4 mr-2" />
                               Tasks
                             </Button>
                           </Link>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="map" className="mt-0">
              <div className="h-[600px]">
                <LocationMap 
                  locations={locations}
                  items={allItems}
                  onLocationClick={(location) => {
                    setEditingLocation(location);
                    setLocationFormOpen(true);
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}

        <LocationForm
          open={locationFormOpen}
          onClose={() => { setLocationFormOpen(false); setEditingLocation(null); }}
          onSubmit={handleSubmit}
          location={editingLocation}
          users={users.filter(u => u.call_sign)}
          allLocations={locations}
        />

        <ICS205Form
          open={ics205FormOpen}
          onClose={() => {
            setIcs205FormOpen(false);
            setEditingIcs205(null);
            setSelectedLocationForIcs205(null);
          }}
          onSubmit={handleIcs205Submit}
          form={editingIcs205}
          locationName={selectedLocationForIcs205?.name}
        />
      </div>
    </div>
  );
}