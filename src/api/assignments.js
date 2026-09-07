import { supabase } from './supabaseClient';
import { TABLES } from './db';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/**
 * Operator response to an offer, or a planner status change. The database
 * trigger enforces the ladder for non-planners and stamps timestamps.
 * @param {string} assignmentId
 * @param {'accepted'|'declined'|'checked_in'|'on_position'|'released'|'no_show'|'cancelled'|'offered'} status
 * @param {{ reason?: string, notes?: string }} [extra]
 */
export async function setAssignmentStatus(assignmentId, status, extra = {}) {
  const patch = { status };
  if (extra.reason !== undefined) patch.decline_reason = extra.reason || null;
  if (extra.notes !== undefined) patch.notes = extra.notes || null;
  return unwrap(await supabase.from(TABLES.assignments).update(patch).eq('id', assignmentId).select().single());
}

/** Record that the operator has seen the current plan version (dismisses the change banner). */
export async function markPacketSeen(assignmentId, version) {
  return unwrap(await supabase.from(TABLES.assignments).update({ packet_version_seen: version }).eq('id', assignmentId).select().single());
}

/**
 * Offer a shift to an operator (planner).
 * @param {{ shiftId: string, deploymentId: string, userId: string, createdBy?: string|null, status?: 'offered'|'accepted' }} args
 */
export async function offerAssignment({ shiftId, deploymentId, userId, createdBy = null, status = 'offered' }) {
  return unwrap(await supabase.from(TABLES.assignments)
    .insert({ shift_id: shiftId, deployment_id: deploymentId, user_id: userId, created_by: createdBy, status })
    .select().single());
}

export async function removeAssignment(assignmentId) {
  unwrap(await supabase.from(TABLES.assignments).delete().eq('id', assignmentId));
}
