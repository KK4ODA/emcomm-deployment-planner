import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Package, CheckCircle, ArrowLeft, AlertCircle, Radio, ListTodo, Clock, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";

const priorityStyles = {
  essential: "bg-rose-100 text-rose-700 border-rose-200",
  important: "bg-amber-100 text-amber-700 border-amber-200",
  optional: "bg-slate-100 text-slate-600 border-slate-200",
};

const priorityIcons = {
  essential: AlertCircle,
  important: Package,
  optional: CheckCircle,
};

export default function MyAssignments() {
  const [user, setUser] = useState(null);
  const [currentDeploymentId] = useState(
    localStorage.getItem('currentDeploymentId') || null
  );

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: allCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order')
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ['items'],
    queryFn: () => base44.entities.DeploymentItem.list()
  });

  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.DeploymentLocation.list('sort_order')
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list()
  });

  // Real-time updates for items and tasks
  useEffect(() => {
    const unsubscribeItems = base44.entities.DeploymentItem.subscribe((event) => {
      queryClient.invalidateQueries(['items']);
    });
    const unsubscribeTasks = base44.entities.Task.subscribe((event) => {
      queryClient.invalidateQueries(['tasks']);
    });
    return () => {
      unsubscribeItems();
      unsubscribeTasks();
    };
  }, [queryClient]);

  const { data: currentDeployment } = useQuery({
    queryKey: ['deployment', currentDeploymentId],
    queryFn: () => currentDeploymentId ? base44.entities.Deployment.filter({ id: currentDeploymentId }).then(d => d[0]) : null,
    enabled: !!currentDeploymentId
  });

  // Filter by deployment
  const categories = allCategories.filter(c => c.deployment_id === currentDeploymentId);
  const locations = allLocations.filter(l => l.deployment_id === currentDeploymentId);
  
  const items = allItems.filter(i => {
    return locations.some(loc => loc.id === i.deployment_location_id);
  });

  const myItems = items.filter(item => {
    const assignedCallSigns = Array.isArray(item.assigned_to) ? item.assigned_to : (item.assigned_to ? [item.assigned_to] : []);
    return assignedCallSigns.includes(user?.call_sign);
  });

  const myTasks = allTasks.filter(task => {
    return task.assigned_to_call_sign === user?.call_sign &&
           locations.some(loc => loc.id === task.deployment_location_id);
  });

  const getCategoryName = (categoryId) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  const getCategoryColor = (categoryId) => {
    return categories.find(c => c.id === categoryId)?.color || 'slate';
  };

  const groupedItems = myItems.reduce((acc, item) => {
    const priority = item.priority || 'important';
    if (!acc[priority]) acc[priority] = [];
    acc[priority].push(item);
    return acc;
  }, {});

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
      </div>
    );
  }

  if (!currentDeploymentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-100 p-12">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-break { page-break-after: always; }
          h1 { font-size: 24pt; margin-bottom: 12pt; }
          h2 { font-size: 18pt; margin-top: 12pt; margin-bottom: 8pt; }
          .card { border: 1px solid #e5e7eb; margin-bottom: 8pt; padding: 8pt; }
        }
      `}</style>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link 
          to={createPageUrl('Dashboard')} 
          className="no-print inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">My Assignments</h1>
              <div className="flex items-center gap-3 text-slate-500">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4" />
                  <span className="font-mono">{user.call_sign || 'No call sign set'}</span>
                </div>
                {currentDeployment && (
                  <>
                    <span>•</span>
                    <span>{currentDeployment.name}</span>
                  </>
                )}
              </div>
            </div>
            {user.call_sign && (myItems.length > 0 || myTasks.length > 0) && (
              <Button 
                onClick={() => window.print()}
                variant="outline"
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                Print List
              </Button>
            )}
          </div>
        </div>

        {!user.call_sign ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <Radio className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">Set your call sign</h3>
              <p className="text-slate-500 mb-4">
                You need to set your ham radio call sign to see your assignments
              </p>
              <Link 
                to={createPageUrl('Profile')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Go to Profile
              </Link>
            </CardContent>
          </Card>
        ) : myItems.length === 0 && myTasks.length === 0 ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No assignments yet</h3>
              <p className="text-slate-500">
                You haven't been assigned any items or tasks for this deployment
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-slate-100 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                <CardContent className="py-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-300 text-sm">Items to Bring</p>
                      <p className="text-4xl font-bold">{myItems.length}</p>
                    </div>
                    <Package className="h-16 w-16 text-slate-500" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-100 bg-gradient-to-r from-blue-800 to-blue-700 text-white">
                <CardContent className="py-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-200 text-sm">Tasks Assigned</p>
                      <p className="text-4xl font-bold">{myTasks.length}</p>
                      <p className="text-blue-200 text-xs mt-1">
                        {myTasks.filter(t => t.status === 'completed').length} completed
                      </p>
                    </div>
                    <ListTodo className="h-16 w-16 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tasks Section */}
            {myTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ListTodo className="h-5 w-5 text-blue-500" />
                  <h2 className="font-semibold text-slate-900">My Tasks</h2>
                  <Badge variant="secondary" className="ml-auto">
                    {myTasks.filter(t => t.status !== 'completed').length} active
                  </Badge>
                </div>
                <div className="space-y-2">
                  {myTasks.map((task, index) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="border-slate-100 hover:shadow-md transition-shadow">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-3">
                            {task.status === 'completed' ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <Clock className="h-5 w-5 text-slate-400" />
                            )}
                            <div className="flex-1">
                              <h4 className={`font-medium text-slate-900 ${task.status === 'completed' ? 'line-through' : ''}`}>
                                {task.name}
                              </h4>
                              {task.description && (
                                <p className="text-sm text-slate-500 mt-1">{task.description}</p>
                              )}
                              <div className="flex gap-2 mt-2">
                                <Badge variant="secondary" className={
                                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-100 text-slate-600'
                                }>
                                  {task.status.replace('_', ' ')}
                                </Badge>
                                {task.priority && (
                                  <Badge variant="outline">
                                    {task.priority}
                                  </Badge>
                                )}
                                {task.due_date && (
                                  <span className="text-xs text-slate-500 flex items-center">
                                    Due: {new Date(task.due_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Priority Groups */}
            {myItems.length > 0 && ['essential', 'important', 'optional'].map(priority => {
              const priorityItems = groupedItems[priority];
              if (!priorityItems || priorityItems.length === 0) return null;

              const Icon = priorityIcons[priority];

              return (
                <div key={priority}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`h-5 w-5 ${
                      priority === 'essential' ? 'text-rose-500' :
                      priority === 'important' ? 'text-amber-500' : 'text-slate-400'
                    }`} />
                    <h2 className="font-semibold text-slate-900 capitalize">{priority}</h2>
                    <Badge variant="secondary" className="ml-auto">
                      {priorityItems.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {priorityItems.map((item, index) => {
                     return (
                       <motion.div
                         key={item.id}
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: index * 0.05 }}
                       >
                         <Card className="border-slate-100 hover:shadow-md transition-shadow">
                           <CardContent className="py-4">
                             <div className="flex items-center justify-between flex-1">
                               <div className="flex items-center gap-3">
                                 <div className={`w-2 h-full min-h-[40px] rounded-full bg-${getCategoryColor(item.category_id)}-500`}
                                   style={{ backgroundColor: `var(--${getCategoryColor(item.category_id)}-500, #64748b)` }} />
                                 <div>
                                   <h4 className="font-medium text-slate-900">
                                     {item.name}
                                     {item.quantity > 1 && (
                                       <span className="text-slate-500 ml-2">×{item.quantity}</span>
                                     )}
                                   </h4>
                                   <p className="text-sm text-slate-500">
                                     {getCategoryName(item.category_id)}
                                   </p>
                                   {item.description && (
                                     <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                                   )}
                                 </div>
                               </div>
                               <Badge variant="outline" className={priorityStyles[priority]}>
                                 {priority}
                               </Badge>
                             </div>
                           </CardContent>
                         </Card>
                       </motion.div>
                     );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}