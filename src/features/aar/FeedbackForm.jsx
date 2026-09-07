import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquareHeart, Send, CheckCircle2, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormField';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { reportMutationError } from '@/hooks/useEntities';
import { cn } from '@/lib/utils';

/**
 * Two-minute post-event form. One response per person; anonymous responses
 * carry no user id at all.
 * @param {{ deployment: Object, user: Object, existing?: Object|null, assignmentId?: string|null }} props
 */
export function FeedbackForm({ deployment, user, existing = null, assignmentId = null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ rating: 0, comms_worked: '', went_well: '', problems: '', comms_notes: '', equipment_notes: '', one_change: '', anonymous: false });
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () => db.feedback.create({
      deployment_id: deployment.id,
      assignment_id: form.anonymous ? null : assignmentId,
      user_id: form.anonymous ? null : user.id,
      anonymous: form.anonymous,
      rating: form.rating || null,
      comms_worked: form.comms_worked || null,
      went_well: form.went_well.trim() || null,
      problems: form.problems.trim() || null,
      comms_notes: form.comms_notes.trim() || null,
      equipment_notes: form.equipment_notes.trim() || null,
      one_change: form.one_change.trim() || null,
    }),
    onSuccess: () => { setDone(true); queryClient.invalidateQueries({ queryKey: [...queryKeys.feedback, deployment.id] }); toast.success('Thank you. Your feedback is in the after-action review.'); },
    onError: reportMutationError('Send feedback'),
  });

  if (existing || done) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-sm">
          <CheckCircle2 className="h-6 w-6 text-success" />
          <div><p className="font-medium">Thanks, your feedback for {deployment.name} is recorded.</p><p className="text-muted-foreground">The coordinator sees it alongside the log and hours when writing the after-action review.</p></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageSquareHeart className="h-5 w-5" /> How did {deployment.name} go?</CardTitle>
        <CardDescription>Two minutes. Skip anything that does not apply. This replaces the survey and the self-scoring sheet.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">Overall, how did it go for you?</p>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} of 5`} onClick={() => setForm({ ...form, rating: n })} className={cn('rounded-md p-1.5 transition-colors', n <= form.rating ? 'text-warning' : 'text-muted-foreground/40 hover:text-muted-foreground')}>
                  <Star className="h-7 w-7" fill={n <= form.rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Did the communications plan work?</p>
            <div className="grid grid-cols-3 gap-2">
              {[['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']].map(([v, l]) => (
                <Button key={v} type="button" variant={form.comms_worked === v ? 'default' : 'outline'} onClick={() => setForm({ ...form, comms_worked: v })}>{l}</Button>
              ))}
            </div>
          </div>
          <FormField label="What went well?">{({ id }) => <Textarea id={id} rows={2} value={form.went_well} onChange={(e) => setForm({ ...form, went_well: e.target.value })} />}</FormField>
          <FormField label="What was a problem?">{({ id }) => <Textarea id={id} rows={2} value={form.problems} onChange={(e) => setForm({ ...form, problems: e.target.value })} />}</FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Radio / frequencies" hint="Could you reach net control? Which path worked or failed?">{({ id }) => <Textarea id={id} rows={2} value={form.comms_notes} onChange={(e) => setForm({ ...form, comms_notes: e.target.value })} />}</FormField>
            <FormField label="Equipment" hint="Anything that failed, ran out, or was missing">{({ id }) => <Textarea id={id} rows={2} value={form.equipment_notes} onChange={(e) => setForm({ ...form, equipment_notes: e.target.value })} />}</FormField>
          </div>
          <FormField label="One thing to change next time">{({ id }) => <Textarea id={id} rows={2} value={form.one_change} onChange={(e) => setForm({ ...form, one_change: e.target.value })} />}</FormField>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={form.anonymous} onCheckedChange={(v) => setForm({ ...form, anonymous: v === true })} className="mt-0.5" />
            <span><span className="font-medium">Send anonymously</span><span className="block text-xs text-muted-foreground">Your name and assignment are not stored with the answers.</span></span>
          </label>
          <Button type="submit" size="lg" loading={submit.isPending}><Send /> Send feedback</Button>
        </form>
      </CardContent>
    </Card>
  );
}
