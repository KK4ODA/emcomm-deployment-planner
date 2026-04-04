import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, User, GripVertical, Copy } from "lucide-react";
import { motion } from "framer-motion";

const priorityStyles = {
  essential: "bg-rose-100 text-rose-700 border-rose-200",
  important: "bg-amber-100 text-amber-700 border-amber-200",
  optional: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ItemRow({ item, users, onEdit, onDelete, onDuplicate, onAssign, canEdit, canDelete, canAssign, currentUserCallSign, dragHandleProps, isDragging }) {
  const [selectOpen, setSelectOpen] = React.useState(false);
  const assignedCallSigns = Array.isArray(item.assigned_to) ? item.assigned_to : (item.assigned_to ? [item.assigned_to] : []);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-200 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {canEdit && dragHandleProps && (
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing mr-2">
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {assignedCallSigns.length === 0 && (
            <div className="relative flex items-center justify-center w-3 h-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </div>
          )}
          <h4 className="font-medium text-slate-900 text-sm">
            {item.name}
          </h4>
          {item.quantity > 1 && (
            <span className="text-xs text-slate-500">×{item.quantity}</span>
          )}
          {item.priority && (
            <Badge variant="outline" className={`text-xs ${priorityStyles[item.priority]}`}>
              {item.priority}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-3">
        {assignedCallSigns.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {assignedCallSigns.map(callSign => (
              <Badge key={callSign} variant="secondary" className="text-xs">
                {callSign}
              </Badge>
            ))}
          </div>
        )}
        {canAssign ? (
          <Select
            open={selectOpen}
            onOpenChange={setSelectOpen}
            value="placeholder"
            onValueChange={(value) => {
              if (value !== "placeholder") {
                onAssign(item, value);
              }
            }}
          >
            <SelectTrigger className="w-28 h-8 text-sm bg-slate-900 text-white hover:bg-slate-800 border-slate-900 shadow-sm hover:shadow-md transition-all cursor-pointer font-medium">
              <SelectValue>
                Assignment
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {users.map(user => {
                const isAssigned = assignedCallSigns.includes(user.call_sign);
                return (
                  <SelectItem key={user.id} value={user.call_sign}>
                    <div className="flex items-center justify-between w-full">
                      <span>{user.call_sign}</span>
                      {isAssigned && <span className="text-emerald-600 ml-2">✓</span>}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : assignedCallSigns.length === 0 ? (
          <span className="text-xs text-slate-400">Unassigned</span>
        ) : null}

        {(canEdit || canDelete) && (
          <div className="flex gap-1">
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => onDuplicate(item)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700" onClick={() => onDelete(item)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}