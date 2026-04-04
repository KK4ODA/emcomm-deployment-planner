import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Trash2, Package, MapPin, FolderOpen, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import TemplateForm from "@/components/TemplateForm";

export default function TemplatesPage() {
  const [user, setUser] = useState(null);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.DeploymentTemplate.list('-created_date')
  });

  const isAdmin = user?.app_role === 'admin';

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DeploymentTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setEditFormOpen(false);
      setEditingTemplate(null);
      toast.success('Template updated');
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: (id) => base44.entities.DeploymentTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      toast.success('Template deleted');
    }
  });

  const handleEditSubmit = (data) => {
    if (editingTemplate) {
      updateTemplate.mutate({
        id: editingTemplate.id,
        data: { ...editingTemplate, ...data }
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Deployment Templates</h1>
          <p className="text-slate-500">Reusable deployment structures for quick setup</p>
        </div>

        {templates.length === 0 ? (
          <Card className="border-slate-100">
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No templates yet</h3>
              <p className="text-slate-500">
                Save a deployment as a template from the Deployments page to reuse its structure
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template, index) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border-slate-100 hover:shadow-lg transition-all h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <FileText className="h-5 w-5 text-slate-600" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          {template.description && (
                            <p className="text-sm text-slate-500 mt-1">{template.description}</p>
                          )}
                          {template.created_date && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                              <Clock className="h-3 w-3" />
                              <span>Saved {format(new Date(template.created_date), 'MMM d, yyyy h:mm a')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-600 hover:text-rose-700"
                          onClick={() => {
                            if (confirm('Delete this template?')) {
                              deleteTemplate.mutate(template.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-slate-900">
                          {template.category_count || 0}
                        </div>
                        <div className="text-xs text-slate-500">Categories</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-slate-900">
                          {template.item_count || 0}
                        </div>
                        <div className="text-xs text-slate-500">Items</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-slate-900">
                          {template.location_count || 0}
                        </div>
                        <div className="text-xs text-slate-500">Locations</div>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        className="w-full mt-4"
                        onClick={() => {
                          setEditingTemplate(template);
                          setEditFormOpen(true);
                        }}
                      >
                        Edit Details
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <TemplateForm
          open={editFormOpen}
          onClose={() => {
            setEditFormOpen(false);
            setEditingTemplate(null);
          }}
          onSubmit={handleEditSubmit}
          template={editingTemplate}
        />
      </div>
    </div>
  );
}