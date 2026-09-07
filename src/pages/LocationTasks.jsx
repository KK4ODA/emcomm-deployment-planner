import React, { useState, useEffect } from 'react';
import { db } from '@/api/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowLeft, CheckCircle2, Clock, ListTodo, Wifi, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TaskForm from "@/components/TaskForm";
import TaskItem from "@/components/TaskItem";
import { canCreate, canEdit, canDelete } from "@/components/permissions.jsx";
import { useOffline } from "@/components/OfflineProvider";
import { toast } from "sonner";
import {
  createTaskEvent,
  updateTaskEvent,
  deleteTaskEvent,
  listTasksLocal,
} from "@/api/taskEvents";
import { useAuth } from "@/lib/AuthContext";

export default function LocationTasksPage() {
  const { user } = useAuth();
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const { isOnline, tier } = useOffline();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const locationId = urlParams.get('location');

  // Read tasks from IndexedDB (materialized local view)
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: listTasksLocal,
    // Re-run whenever sync engine applies remote events
    staleTime: 0,
  });

  // Listen for tasks updated by the sync engine (Realtime or inbox fetch)
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });
    window.addEventListener('emcomm:tasks-updated', handler);
    return () => window.removeEventListener('emcomm:tasks-updated', handler);
  }, [queryClient]);

  const { data: allLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => db.locations.list({ orderBy: 'sort_order' }),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => db.users.list(),
  });

  const location = allLocations.find(l => l.id === locationId);
  const tasks = allTasks.filter(t => t.deployment_location_id === locationId);
  const userRole = user?.app_role;
  const canCreateTask = canCreate(userRole, 'task');
  const canEditTask = canEdit(userRole, 'task');
  const canDeleteTask = canDelete(userRole, 'task');

  const availableCallSigns = location?.assigned_call_signs || [];
  const deploymentId = location?.deployment_id ?? null;

  const createTask = useMutation({
    mutationFn: (data) => createTaskEvent(data, user, isOnline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTaskFormOpen(false);
      toast.success('Task created');
    },
    onError: (err) => {
      console.error('Create task failed:', err);
      toast.error(`Failed to create task: ${err?.message || 'unknown error'}`);
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }) => updateTaskEvent(id, data, user, deploymentId, isOnline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTaskFormOpen(false);
      setEditingTask(null);
    },
    onError: (err) => {
      console.error('Update task failed:', err);
      toast.error(`Failed to update task: ${err?.message || 'unknown error'}`);
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id) => deleteTaskEvent(id, user, deploymentId, isOnline),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => {
      console.error('Delete task failed:', err);
      toast.error(`Failed to delete task: ${err?.message || 'unknown error'}`);
    },
  });

  const handleSubmit = (data) => {
    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, data });
    } else {
      createTask.mutate(data);
    }
  };

  const handleStatusChange = (task) => {
    const nextStatus = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
    };
    updateTask.mutate({
      id: task.id,
      data: { status: nextStatus[task.status] },
    });
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (!locationId || !location) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-2xl border border-slate-100 p-12">
            <ListTodo className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Site Not Found</h2>
            <p className="text-slate-500 mb-6">
              Please select a site from the Deployment Sites page.
            </p>
            <Link to={createPageUrl('Locations')}>
              <Button className="bg-slate-900 hover:bg-slate-800">
                Go to Deployment Sites
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <Link
            to={createPageUrl('Locations')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Deployment Sites
          </Link>
          {/* Connectivity tier indicator */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
            isOnline
              ? 'bg-green-50 text-green-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {isOnline
              ? <><Wifi className="h-3 w-3" /> Online</>
              : <><WifiOff className="h-3 w-3" /> Offline — changes queued</>
            }
          </span>
        </div>

        <div className="flex items-center justify-between mb-8 mt-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Setup Tasks</h1>
            <p className="text-slate-500">{location.name}</p>
          </div>
          {canCreateTask && (
            <Button
              onClick={() => { setEditingTask(null); setTaskFormOpen(true); }}
              className="gap-2 bg-slate-900 hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="border-slate-100">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Clock className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{pendingTasks.length}</p>
                  <p className="text-sm text-slate-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-100">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ListTodo className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{inProgressTasks.length}</p>
                  <p className="text-sm text-slate-500">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-100">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{completedTasks.length}</p>
                  <p className="text-sm text-slate-500">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {tasks.length === 0 ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <ListTodo className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No tasks yet</h3>
              <p className="text-slate-500 mb-4">
                {canCreateTask ? 'Start by creating setup tasks for this location' : 'Waiting for tasks to be created'}
              </p>
              {canCreateTask && (
                <Button onClick={() => setTaskFormOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Task
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pending */}
            <div>
              <h2 className="font-semibold text-slate-700 mb-3">Pending</h2>
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    canEdit={canEditTask}
                    canDelete={canDeleteTask}
                    onEdit={(task) => { setEditingTask(task); setTaskFormOpen(true); }}
                    onDelete={(task) => {
                      if (confirm('Delete this task?')) deleteTask.mutate(task.id);
                    }}
                    onStatusChange={handleStatusChange}
                  />
                ))}
                {pendingTasks.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No pending tasks</p>
                )}
              </div>
            </div>

            {/* In Progress */}
            <div>
              <h2 className="font-semibold text-slate-700 mb-3">In Progress</h2>
              <div className="space-y-3">
                {inProgressTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    canEdit={canEditTask}
                    canDelete={canDeleteTask}
                    onEdit={(task) => { setEditingTask(task); setTaskFormOpen(true); }}
                    onDelete={(task) => {
                      if (confirm('Delete this task?')) deleteTask.mutate(task.id);
                    }}
                    onStatusChange={handleStatusChange}
                  />
                ))}
                {inProgressTasks.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No tasks in progress</p>
                )}
              </div>
            </div>

            {/* Completed */}
            <div>
              <h2 className="font-semibold text-slate-700 mb-3">Completed</h2>
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    canEdit={canEditTask}
                    canDelete={canDeleteTask}
                    onEdit={(task) => { setEditingTask(task); setTaskFormOpen(true); }}
                    onDelete={(task) => {
                      if (confirm('Delete this task?')) deleteTask.mutate(task.id);
                    }}
                    onStatusChange={handleStatusChange}
                  />
                ))}
                {completedTasks.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No completed tasks</p>
                )}
              </div>
            </div>
          </div>
        )}

        <TaskForm
          open={taskFormOpen}
          onClose={() => { setTaskFormOpen(false); setEditingTask(null); }}
          onSubmit={handleSubmit}
          task={editingTask}
          locationId={locationId}
          availableCallSigns={availableCallSigns}
          submitting={createTask.isPending || updateTask.isPending}
        />
      </div>
    </div>
  );
}
