import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Clock, Edit, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

const statusIcons = {
  pending: Clock,
  in_progress: Circle,
  completed: CheckCircle2
};

const statusColors = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-600",
  completed: "bg-green-100 text-green-600"
};

const priorityColors = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-800"
};

export default function TaskItem({ task, canEdit, canDelete, onEdit, onDelete, onStatusChange }) {
  const StatusIcon = statusIcons[task.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:shadow-sm transition-all"
    >
      <button
        onClick={() => onStatusChange && onStatusChange(task)}
        className="mt-1"
      >
        <StatusIcon className={`h-5 w-5 ${task.status === 'completed' ? 'text-green-500' : 'text-slate-400'}`} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className={`font-medium text-slate-900 ${task.status === 'completed' ? 'line-through' : ''}`}>
              {task.name}
            </h4>
            {task.description && (
              <p className="text-sm text-slate-500 mt-1">{task.description}</p>
            )}
          </div>
          {(canEdit || canDelete) && (
            <div className="flex gap-1">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(task)}
                >
                  <Edit className="h-3 w-3" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => onDelete(task)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge className={statusColors[task.status]} variant="secondary">
            {task.status.replace('_', ' ')}
          </Badge>
          <Badge className={priorityColors[task.priority]} variant="secondary">
            {task.priority}
          </Badge>
          {task.assigned_to_call_sign && (
            <Badge variant="outline" className="text-xs">
              {task.assigned_to_call_sign}
            </Badge>
          )}
          {task.due_date && (
            <span className="text-xs text-slate-500">
              Due: {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}