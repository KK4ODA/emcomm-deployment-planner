/**
 * Safety Officer checklist as a signed artifact. The default items follow
 * the areas of the ARRL Field Day Safety Check List (fuel, power, antennas,
 * first aid, weather, site) in our own words; a group can edit the text
 * before signing. Once signed, the row is immutable on the server.
 */

export const SAFETY_TEMPLATE_NAME = 'ARRL Field Day safety check list';

export const DEFAULT_SAFETY_ITEMS = Object.freeze([
  'Fuel for generators stored properly and safely away from operating positions',
  'Fire extinguisher on hand and readily available at each generator and operating position',
  'First aid kit on hand and its location known to everyone on site',
  'Access to NWS or other weather information; a plan for severe weather',
  'Tent stakes, guy lines and cables flagged; trip hazards marked or covered',
  'Electrical wiring safe: GFCI protection, properly rated extension cords, no exposed connections',
  'Generators properly grounded; exhaust away from people, tents and openings',
  'All antenna supports and towers erected with adequate help and clear of power lines',
  'Antenna structures, masts and guys checked before use and after weather changes',
  'RF exposure evaluated; feedlines and antennas kept out of reach where power justifies it',
  'Fuel, gas cylinders and generators kept away from open flames and smoking',
  'Site access and lighting adequate for arrivals and departures after dark',
  'Adequate water, shade and rest arrangements for the expected weather',
  'Minors supervised by an adult at all times; visitors briefed on hazards',
  'Emergency contacts, nearest hospital and site address posted at the operating positions',
  'Safety briefing delivered to every operator on arrival',
]);

/** Fresh checklist items from a list of strings. */
export function newChecklistItems(texts = DEFAULT_SAFETY_ITEMS) {
  return texts.map((text, i) => ({ id: `s${i + 1}`, text, state: /** @type {'pending'|'ok'|'na'} */ ('pending'), note: /** @type {string|null} */ (null) }));
}

/**
 * Progress and whether the list can be signed (every item answered).
 * @param {Array<{ state: 'pending'|'ok'|'na' }>} items
 */
export function checklistProgress(items) {
  const total = items.length;
  const ok = items.filter(i => i.state === 'ok').length;
  const na = items.filter(i => i.state === 'na').length;
  const pending = total - ok - na;
  return { total, ok, na, pending, complete: total > 0 && pending === 0 };
}

/** Plain-text rendering for the AAR and the printout. */
export function checklistText(checklist) {
  const lines = [`${checklist.template_name || SAFETY_TEMPLATE_NAME}`];
  for (const i of checklist.items || []) lines.push(`- [${i.state === 'ok' ? 'x' : i.state === 'na' ? '-' : ' '}] ${i.text}${i.note ? ` (${i.note})` : ''}`);
  if (checklist.notes) lines.push('', checklist.notes);
  lines.push('', checklist.signed_at ? `Signed by ${checklist.signed_name || 'the Safety Officer'} on ${new Date(checklist.signed_at).toLocaleString()}` : 'Not yet signed');
  return lines.join('\n');
}
