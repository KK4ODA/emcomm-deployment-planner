import React, { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Trash2, Pencil, Layers, MapPin, Package, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useTemplates, useEntityMutations } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { canEdit, canDelete } from '@/lib/permissions';
import { formatDateTime } from '@/lib/time';
import { TemplateForm } from '@/features/templates/TemplateForm';

export default function Templates() {
  const { user } = useAuth();
  const templatesQ = useTemplates();
  const mutations = useEntityMutations('templates', queryKeys.templates, { label: 'template' });
  const [editing, setEditing] = useState(null);
  const { confirm, dialog } = useConfirm();
  const mayEdit = canEdit(user?.app_role, 'template');
  const mayDelete = canDelete(user?.app_role, 'template');

  const remove = async (template) => {
    if (await confirm({ title: `Delete template “${template.name}”?`, description: 'Deployments already created from it are not affected.', destructive: true })) {
      mutations.remove.mutate(template.id, { onSuccess: () => toast.success('Template deleted') });
    }
  };

  return (
    <>
      <PageHeader icon={FileText} title="Deployment templates" description="Reusable site, category and item structures. Save one from any deployment." />
      <QueryState queries={[templatesQ]}>
        {(templatesQ.data ?? []).length === 0 ? (
          <EmptyState icon={FileText} title="No templates yet" description="Open the Deployments page and choose “Save as template” from a deployment's menu." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templatesQ.data.map(t => (
              <Card key={t.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold">{t.name}</h3>
                      {t.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                      {t.created_at && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Saved {formatDateTime(t.created_at)}</p>
                      )}
                    </div>
                    {(mayEdit || mayDelete) && (
                      <div className="flex shrink-0">
                        {mayEdit && <Button variant="ghost" size="icon-sm" aria-label="Edit template" onClick={() => setEditing(t)}><Pencil /></Button>}
                        {mayDelete && <Button variant="ghost" size="icon-sm" aria-label="Delete template" className="text-destructive hover:text-destructive" onClick={() => remove(t)}><Trash2 /></Button>}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { icon: MapPin, label: 'Sites', value: t.location_count || 0 },
                      { icon: Layers, label: 'Categories', value: t.category_count || 0 },
                      { icon: Package, label: 'Items', value: t.item_count || 0 },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="rounded-md bg-muted/60 py-2">
                        <dd className="tnum text-lg font-semibold leading-tight">{value}</dd>
                        <dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3" />{label}</dt>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      <TemplateForm
        open={!!editing}
        template={editing}
        onClose={() => setEditing(null)}
        onSubmit={(data) => mutations.update.mutate({ id: editing.id, data }, { onSuccess: () => { setEditing(null); toast.success('Template updated'); } })}
        submitting={mutations.update.isPending}
      />
      {dialog}
    </>
  );
}
