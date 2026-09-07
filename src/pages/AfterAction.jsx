import React, { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck, Download, Copy, Users, Clock, AlertTriangle, MessageSquareHeart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Section } from '@/components/common/Section';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { usePositions, useShifts, useAssignments, useUsers, useActivityLog, useHourEntries, useFeedback, useLessons, useObjectives, reportMutationError } from '@/hooks/useEntities';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { aarSummary, aarMarkdown } from '@/lib/aar';
import { downloadBlob, safeFileName } from '@/lib/download';
import { formatDateTime } from '@/lib/time';
import { FeedbackForm } from '@/features/aar/FeedbackForm';
import { LessonsList } from '@/features/aar/LessonsList';

/**
 * /aar: operators see the feedback form; planners see the assembled review
 * (participation, incidents, feedback, lessons) and can export it.
 */
export default function AfterAction() {
  return <DeploymentGate><AfterActionContent /></DeploymentGate>;
}

function AfterActionContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const queryClient = useQueryClient();
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  const usersQ = useUsers();
  const logQ = useActivityLog(deploymentId);
  const hoursQ = useHourEntries();
  const feedbackQ = useFeedback(deploymentId);
  const lessonsQ = useLessons();
  const objectivesQ = useObjectives();
  const isPlanner = hasPermission(user?.app_role, 'MANAGE_ASSIGNMENTS');

  const byDep = (rows) => (rows ?? []).filter(r => r.deployment_id === deploymentId);
  const positions = useMemo(() => byDep(positionsQ.data), [positionsQ.data, deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shifts = useMemo(() => byDep(shiftsQ.data), [shiftsQ.data, deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => byDep(assignmentsQ.data), [assignmentsQ.data, deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const hours = useMemo(() => byDep(hoursQ.data), [hoursQ.data, deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const lessons = useMemo(() => byDep(lessonsQ.data), [lessonsQ.data, deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const feedback = useMemo(() => feedbackQ.data ?? [], [feedbackQ.data]);
  const objectives = useMemo(() => byDep(objectivesQ.data), [objectivesQ.data, deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const summary = useMemo(() => aarSummary({ assignments, positions, shifts, log: logQ.data ?? [], hours, feedback, usersById, objectives }), [assignments, positions, shifts, logQ.data, hours, feedback, usersById, objectives]);
  const myAssignment = assignments.find(a => a.user_id === user?.id && ['checked_in', 'on_position', 'released', 'accepted'].includes(a.status)) ?? null;
  const myFeedback = feedback.find(f => f.user_id === user?.id) ?? null;

  const invalidateLessons = () => queryClient.invalidateQueries({ queryKey: queryKeys.lessons });
  const addLesson = useMutation({
    mutationFn: (/** @type {Object} */ data) => db.lessons.create({ ...data, deployment_id: deploymentId, ares_group_id: deployment.ares_group_id, created_by: user.id }),
    onSuccess: invalidateLessons, onError: reportMutationError('Add lesson'),
  });
  const updateLesson = useMutation({ mutationFn: (/** @type {{ id: string, patch: Object }} */ { id, patch }) => db.lessons.update(id, patch), onSuccess: invalidateLessons, onError: reportMutationError('Update lesson') });
  const deleteLesson = useMutation({ mutationFn: (/** @type {string} */ id) => db.lessons.remove(id), onSuccess: invalidateLessons, onError: reportMutationError('Delete lesson') });

  const planChanges = deployment.plan_published_at ? [{ version: deployment.plan_version, at: deployment.plan_published_at, note: deployment.plan_change_note }] : [];
  const markdown = () => aarMarkdown({ deployment, summary, feedback, lessons, usersById, planChanges, objectives });
  const copy = async () => { try { await navigator.clipboard.writeText(markdown()); toast.success('AAR draft copied'); } catch { toast.error('Clipboard unavailable; use Download.'); } };

  return (
    <QueryState queries={[positionsQ, shiftsQ, assignmentsQ, usersQ, feedbackQ, lessonsQ]}>
      <PageHeader
        icon={ClipboardCheck}
        eyebrow={deployment.name}
        title="After action"
        description={isPlanner ? 'What happened, assembled from check-ins, the log, hours and operator feedback. Turn it into lessons that follow the event next year.' : 'Tell the coordinator how it went. Two minutes, optionally anonymous.'}
        actions={isPlanner && (
          <>
            <Button variant="outline" onClick={copy}><Copy /> Copy draft</Button>
            <Button variant="outline" onClick={() => downloadBlob(markdown(), `AAR_${safeFileName(deployment.name)}.md`, 'text/markdown;charset=utf-8')}><Download /> Download draft</Button>
          </>
        )}
      />

      <div className="mb-4">
        <FeedbackForm deployment={deployment} user={user} existing={myFeedback} assignmentId={myAssignment?.id ?? null} />
      </div>

      {isPlanner && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCard label="Operators worked" value={summary.operators} icon={Users} tone="info" hint={`${summary.slotsWorked} of ${summary.shifts} shift slots`} />
            <StatCard label="Person-hours" value={summary.totalHours} icon={Clock} />
            <StatCard label="No-shows" value={summary.noShows.length} icon={AlertTriangle} tone={summary.noShows.length ? 'critical' : 'success'} />
            <StatCard label="Unstaffed shifts" value={summary.unstaffed.length} icon={AlertTriangle} tone={summary.unstaffed.length ? 'warning' : 'success'} />
            <StatCard label="Feedback" value={summary.feedbackCount} icon={MessageSquareHeart} tone="accent" hint={summary.averageRating ? `average ${summary.averageRating}/5` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <LessonsList lessons={lessons} positions={positions} canEdit onAdd={(d) => addLesson.mutate(d)} onUpdate={(id, patch) => updateLesson.mutate({ id, patch })} onDelete={(id) => deleteLesson.mutate(id)} busy={addLesson.isPending} />
              <Section title="Incidents and notes" icon={AlertTriangle} aside={`${summary.incidents.length}`} bodyClassName="p-0">
                {summary.incidents.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing logged beyond check-ins.</p> : (
                  <ul className="divide-y text-sm">{summary.incidents.map(e => <li key={e.id} className="px-3 py-1.5"><span className="tnum mr-2 text-xs text-muted-foreground">{formatDateTime(e.occurred_at, 'MMM d HH:mm')}</span>{e.summary}</li>)}</ul>
                )}
              </Section>
              {(summary.noShows.length > 0 || summary.unstaffed.length > 0) && (
                <Section title="Gaps" icon={AlertTriangle}>
                  {summary.noShows.length > 0 && <p className="text-sm">No-shows: {summary.noShows.map(n => <span key={n.callSign + n.position} className="mr-2 inline-flex items-center gap-1"><CallSign value={n.callSign} /> {n.position}</span>)}</p>}
                  {summary.unstaffed.length > 0 && <p className="mt-1 text-sm">Unstaffed: {summary.unstaffed.map(u => u.tactical || u.position).join(', ')}</p>}
                </Section>
              )}
            </div>
            <Section title="Operator feedback" icon={MessageSquareHeart} aside={<span>yes {summary.commsVotes.yes} · partly {summary.commsVotes.partly} · no {summary.commsVotes.no} on comms</span>} bodyClassName="p-0">
              {feedback.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No responses yet. Operators find the form under After action once they have checked out.</p> : (
                <ul className="divide-y text-sm">
                  {feedback.map(f => {
                    const u = f.user_id ? usersById.get(f.user_id) : null;
                    return (
                      <li key={f.id} className="space-y-1 px-3 py-2">
                        <p className="flex flex-wrap items-center gap-2 font-medium">{u?.call_sign ? <CallSign value={u.call_sign} /> : <Badge variant="muted">Anonymous</Badge>}{f.rating && <span className="inline-flex items-center gap-0.5 text-warning"><Star className="h-3.5 w-3.5" fill="currentColor" /> {f.rating}</span>}{f.comms_worked && <Badge variant={f.comms_worked === 'yes' ? 'success' : f.comms_worked === 'partly' ? 'warning' : 'critical'}>comms {f.comms_worked}</Badge>}</p>
                        {f.went_well && <p><span className="text-muted-foreground">Went well:</span> {f.went_well}</p>}
                        {f.problems && <p><span className="text-muted-foreground">Problems:</span> {f.problems}</p>}
                        {f.comms_notes && <p><span className="text-muted-foreground">Comms:</span> {f.comms_notes}</p>}
                        {f.equipment_notes && <p><span className="text-muted-foreground">Equipment:</span> {f.equipment_notes}</p>}
                        {f.one_change && <p><span className="text-muted-foreground">One change:</span> {f.one_change}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </QueryState>
  );
}
