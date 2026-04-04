import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Package } from "lucide-react";
import { motion } from "framer-motion";

const colorClasses = {
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  sky: "bg-sky-50 border-sky-200 text-sky-800",
  rose: "bg-rose-50 border-rose-200 text-rose-800",
  violet: "bg-violet-50 border-violet-200 text-violet-800",
  orange: "bg-orange-50 border-orange-200 text-orange-800",
  slate: "bg-slate-50 border-slate-200 text-slate-800",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
  teal: "bg-teal-50 border-teal-200 text-teal-800",
  pink: "bg-pink-50 border-pink-200 text-pink-800",
};

const dotColors = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  orange: "bg-orange-500",
  slate: "bg-slate-500",
  indigo: "bg-indigo-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
};

export default function CategoryCard({ category, itemCount, onEdit, onDelete, isAdmin }) {
  const colorClass = colorClasses[category.color] || colorClasses.slate;
  const dotColor = dotColors[category.color] || dotColors.slate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`border-2 ${colorClass} hover:shadow-lg transition-all duration-300`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${dotColor}`} />
              <CardTitle className="text-lg font-semibold">{category.name}</CardTitle>
            </div>
            {isAdmin && (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(category)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700" onClick={() => onDelete(category)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {category.description && (
            <p className="text-sm opacity-80 mb-3">{category.description}</p>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4" />
            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}