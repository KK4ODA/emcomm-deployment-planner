import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Section } from '@/components/common/Section';
import { ItemPriorityBadge } from '@/components/common/Badges';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ITEM_PRIORITY, STORAGE_KEYS, categoryColor } from '@/lib/constants';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

/** localStorage key for one operator's packing state in one deployment. */
export function goKitStorageKey(deploymentId, callSign) {
  return `${STORAGE_KEYS.goKitChecked}${deploymentId}:${callSign}`;
}

/**
 * The operator's equipment list with tick boxes for packing. Ticks live in
 * this browser only (they are a personal checklist, not shared state) and
 * print with the page. Mount with `key={storageKey}` so a deployment switch
 * starts from that deployment's saved ticks.
 * @param {{ storageKey: string, items: Object[], categoryById: Map<string, Object>, siteName: Map<string, string> }} props
 */
export function GoKitList({ storageKey, items, categoryById, siteName }) {
  const [checked, setChecked] = useLocalStorage(storageKey, /** @type {Record<string, boolean>} */ ({}));
  const packed = items.filter(i => checked[i.id]).length;

  const grouped = {};
  for (const key of Object.keys(ITEM_PRIORITY)) grouped[key] = [];
  for (const i of items) (grouped[i.priority] ??= []).push(i);

  const toggle = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const reset = () => setChecked({});

  return (
    <Section
      title="Equipment to bring"
      icon={Package}
      aside={(
        <span className="inline-flex items-center gap-2">
          <span className="tnum">{packed}/{items.length} packed</span>
          {packed > 0 && (
            <button type="button" onClick={reset} className="no-print inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </span>
      )}
      bodyClassName="p-0"
    >
      {items.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">No equipment assigned to you.</p> : (
        Object.entries(ITEM_PRIORITY).map(([priority, meta]) => grouped[priority]?.length > 0 && (
          <div key={priority}>
            <h3 className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{meta.label}</span><span className="tnum">{grouped[priority].length}</span>
            </h3>
            <ul className="divide-y">
              {grouped[priority].map(item => {
                const cat = categoryById.get(item.category_id);
                const done = !!checked[item.id];
                const inputId = `gokit-${item.id}`;
                return (
                  <li key={item.id} className={cn('flex items-center gap-3 px-3 py-2', done && 'bg-success/5')}>
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(item.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                      aria-label={`Packed: ${item.name}`}
                    />
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat?.color) }} aria-hidden />
                    <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                      <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through decoration-muted-foreground/60')}>
                        {item.name}{item.quantity > 1 && <span className="tnum ml-1.5 text-xs text-muted-foreground no-underline">×{item.quantity}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{cat?.name || 'Uncategorised'}{siteName.get(item.deployment_location_id) ? ` · ${siteName.get(item.deployment_location_id)}` : ''}{item.description ? ` · ${item.description}` : ''}</p>
                    </label>
                    <ItemPriorityBadge priority={item.priority} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </Section>
  );
}
