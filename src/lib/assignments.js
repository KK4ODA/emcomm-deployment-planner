/**
 * Item assignments are stored as a text[] of call signs. Older rows may hold
 * a single string or null; always go through these helpers.
 */

/** @returns {string[]} */
export function assigneesOf(item) {
  const value = item?.assigned_to;
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

export function isUnassigned(item) {
  return assigneesOf(item).length === 0;
}

/** Toggle a call sign in an item's assignment list. */
export function toggleAssignee(item, callSign) {
  const current = assigneesOf(item);
  return current.includes(callSign) ? current.filter(cs => cs !== callSign) : [...current, callSign];
}

/** Items assigned to a call sign. */
export function itemsAssignedTo(items, callSign) {
  if (!callSign) return [];
  return items.filter(item => assigneesOf(item).includes(callSign));
}

/** Distinct call signs appearing in a list of items. */
export function distinctAssignees(items) {
  const set = new Set();
  for (const item of items) for (const cs of assigneesOf(item)) set.add(cs);
  return set;
}
