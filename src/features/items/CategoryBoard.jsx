import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { ItemRow } from './ItemRow';
import { categoryColor } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Categories with their items, both reorderable by drag and drop when the
 * user may edit. Order is persisted through onReorderCategories/onReorderItems.
 *
 * @param {{
 *   categories: Object[], itemsByCategory: Map<string, Object[]>, users: Object[], siteNameById: Map<string, string>,
 *   showSite: boolean, permissions: { canEditCategory: boolean, canDeleteCategory: boolean, canEditItem: boolean, canDeleteItem: boolean, canAssignItem: boolean, canCreateItem: boolean },
 *   onEditCategory: (category: Object) => void, onDeleteCategory: (category: Object) => void, onAddItem: (category: Object) => void,
 *   onEditItem: (item: Object) => void, onDeleteItem: (item: Object) => void, onDuplicateItem: (item: Object) => void, onToggleAssignee: (item: Object, callSign: string) => void,
 *   onReorderCategories: (ordered: Object[]) => void, onReorderItems: (ordered: Object[]) => void,
 *   expanded: Record<string, boolean>, onToggleExpanded: (id: string) => void
 * }} props
 */
export function CategoryBoard({
  categories, itemsByCategory, users, siteNameById, showSite, permissions,
  onEditCategory, onDeleteCategory, onAddItem, onEditItem, onDeleteItem, onDuplicateItem, onToggleAssignee,
  onReorderCategories, onReorderItems, expanded, onToggleExpanded,
}) {
  const [dragging, setDragging] = useState(false);

  const handleDragEnd = (result) => {
    setDragging(false);
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.index === destination.index && source.droppableId === destination.droppableId) return;

    if (type === 'CATEGORY') {
      const ordered = Array.from(categories);
      const [moved] = ordered.splice(source.index, 1);
      ordered.splice(destination.index, 0, moved);
      onReorderCategories(ordered);
    } else if (type === 'ITEM' && source.droppableId === destination.droppableId) {
      const ordered = Array.from(itemsByCategory.get(source.droppableId) ?? []);
      const [moved] = ordered.splice(source.index, 1);
      ordered.splice(destination.index, 0, moved);
      onReorderItems(ordered);
    }
  };

  return (
    <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={handleDragEnd}>
      <Droppable droppableId="categories" type="CATEGORY">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={cn('space-y-2', dragging && 'select-none')}>
            {categories.map((category, index) => {
              const items = itemsByCategory.get(category.id) ?? [];
              const isOpen = expanded[category.id] !== false;
              const unassigned = items.filter(i => !i.assigned_to || i.assigned_to.length === 0).length;
              return (
                <Draggable key={category.id} draggableId={category.id} index={index} isDragDisabled={!permissions.canEditCategory}>
                  {(dragProvided, snapshot) => (
                    <section
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={cn('rounded-lg border bg-card shadow-sm', snapshot.isDragging && 'shadow-xl ring-1 ring-accent/40')}
                      aria-label={category.name}
                    >
                      <header className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
                        {permissions.canEditCategory && (
                          <button type="button" {...dragProvided.dragHandleProps} aria-label="Drag to reorder category" className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                            <GripVertical className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onToggleExpanded(category.id)}
                          aria-expanded={isOpen}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(category.color) }} aria-hidden />
                          <span className="truncate text-sm font-semibold">{category.name}</span>
                          <span className="tnum text-xs text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</span>
                          {unassigned > 0 && <span className="tnum rounded bg-destructive/10 px-1.5 text-[11px] font-medium text-destructive">{unassigned} unassigned</span>}
                        </button>
                        <div className="flex items-center gap-0.5">
                          {permissions.canCreateItem && (
                            <Hint label="Add item to this category"><Button variant="ghost" size="icon-sm" onClick={() => onAddItem(category)} aria-label="Add item"><Plus /></Button></Hint>
                          )}
                          {permissions.canEditCategory && (
                            <Hint label="Edit category"><Button variant="ghost" size="icon-sm" onClick={() => onEditCategory(category)} aria-label="Edit category"><Pencil /></Button></Hint>
                          )}
                          {permissions.canDeleteCategory && (
                            <Hint label="Delete category"><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => onDeleteCategory(category)} aria-label="Delete category"><Trash2 /></Button></Hint>
                          )}
                        </div>
                      </header>

                      {isOpen && (
                        <Droppable droppableId={category.id} type="ITEM">
                          {(dropProvided) => (
                            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1 border-t px-2 py-2 sm:px-3">
                              {items.length === 0 && (
                                <p className="py-3 text-center text-xs text-muted-foreground">No items in this category{permissions.canCreateItem ? ' — use + to add one' : ''}.</p>
                              )}
                              {items.map((item, itemIndex) => (
                                <Draggable key={item.id} draggableId={item.id} index={itemIndex} isDragDisabled={!permissions.canEditItem}>
                                  {(itemProvided, itemSnapshot) => (
                                    <div ref={itemProvided.innerRef} {...itemProvided.draggableProps}>
                                      <ItemRow
                                        item={item}
                                        users={users}
                                        siteName={showSite ? siteNameById.get(item.deployment_location_id) : undefined}
                                        canEdit={permissions.canEditItem}
                                        canDelete={permissions.canDeleteItem}
                                        canAssign={permissions.canAssignItem}
                                        onEdit={onEditItem}
                                        onDelete={onDeleteItem}
                                        onDuplicate={onDuplicateItem}
                                        onToggleAssignee={onToggleAssignee}
                                        dragHandleProps={itemProvided.dragHandleProps}
                                        isDragging={itemSnapshot.isDragging}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {dropProvided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      )}
                    </section>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
