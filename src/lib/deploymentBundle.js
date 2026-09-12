/**
 * Deployment files: one deployment with everything a planner built (sites,
 * positions, shifts, periods, comms plan with its channels, map layers,
 * equipment lists, tasks, objectives, safety checklist) as a single JSON
 * document that another group or another computer can import. People are
 * never included: no assignments, no assignees, no authors. Ids are replaced
 * by stable keys so a file can be re-imported any number of times.
 */
import { shiftIso } from './deployments';

export const BUNDLE_FORMAT = 'emcomm-planner-deployment';
export const BUNDLE_VERSION = 1;

const CHANNEL_FIELDS = ['name', 'band', 'config', 'rx_freq', 'rx_tone', 'rx_bandwidth', 'tx_freq', 'tx_tone', 'tx_bandwidth', 'mode', 'digital_mode', 'gateway_callsign', 'tactical_address', 'owner_callsign', 'phone_number', 'lat', 'lon', 'timeout_seconds', 'eligible_users', 'remarks'];
const PLAN_ROW_FIELDS = ['sort_order', 'channel_name', 'band', 'config', 'rx_freq', 'rx_tone', 'rx_bandwidth', 'tx_freq', 'tx_tone', 'tx_bandwidth', 'mode', 'digital_mode', 'gateway_callsign', 'tactical_address', 'owner_callsign', 'phone_number', 'timeout_seconds', 'zone_group', 'channel_number', 'function', 'assignment', 'net', 'condition_level', 'path_role', 'remarks'];

const pick = (row, fields) => Object.fromEntries(fields.filter(f => row[f] !== undefined).map(f => [f, row[f] ?? null]));
const keyer = (prefix) => { const m = new Map(); return { of: (id) => (id == null ? null : m.get(id) ?? null), add: (id) => { const k = `${prefix}${m.size + 1}`; m.set(id, k); return k; } }; };

/**
 * Serialise a deployment and its parts. `parts` is what the Deployments page
 * already assembles for Duplicate, plus objectives, the safety checklist and
 * the group's channel library (only referenced channels are included).
 * @param {{ source: Object, locations?: Object[], categories?: Object[], items?: Object[], tasks?: Object[], periods?: Object[], positions?: Object[], shifts?: Object[], plans?: Object[], planRows?: Object[], layers?: Object[], objectives?: Object[], safety?: Object|null, channels?: Object[] }} parts
 * @param {{ appVersion?: string, groupName?: string, exportedBy?: string }} [meta]
 */
export function buildBundle({ source, locations = [], categories = [], items = [], tasks = [], periods = [], positions = [], shifts = [], plans = [], planRows = [], layers = [], objectives = [], safety = null, channels = [] }, meta = {}) {
  const periodKeys = keyer('op'), siteKeys = keyer('s'), categoryKeys = keyer('c'), positionKeys = keyer('p'), planKeys = keyer('cp'), channelKeys = keyer('ch');
  const bundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    app_version: meta.appVersion ?? null,
    source: { group: meta.groupName ?? null, exported_by: meta.exportedBy ?? null, deployment_name: source.name },
    deployment: {
      name: source.name, description: source.description ?? null, location: source.location ?? null, profile: source.profile ?? 'public_service',
      served_agency: source.served_agency ?? null, requesting_official: source.requesting_official ?? null, tasking_reference: source.tasking_reference ?? null,
      starts_at: source.starts_at ?? null, ends_at: source.ends_at ?? null,
    },
    periods: [...periods].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map(p => ({ key: periodKeys.add(p.id), sequence: p.sequence ?? 1, label: p.label ?? null, starts_at: p.starts_at, ends_at: p.ends_at })),
    sites: [...locations].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(l => ({
      key: siteKeys.add(l.id), name: l.name, description: l.description ?? null, address: l.address ?? null, contact_person: l.contact_person ?? null, site_type: l.site_type ?? null,
      lat: l.lat ?? null, lon: l.lon ?? null, parking_notes: l.parking_notes ?? null, arrival_notes: l.arrival_notes ?? null, access_notes: l.access_notes ?? null, sort_order: l.sort_order ?? 0,
    })),
    categories: [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(c => ({ key: categoryKeys.add(c.id), name: c.name, color: c.color ?? null, description: c.description ?? null, sort_order: c.sort_order ?? 0 })),
    items: items.map(i => ({ category_key: categoryKeys.of(i.category_id), site_key: siteKeys.of(i.deployment_location_id), name: i.name, description: i.description ?? null, quantity: i.quantity ?? 1, priority: i.priority ?? null, sort_order: i.sort_order ?? 0 })),
    tasks: tasks.map(t => ({ site_key: siteKeys.of(t.deployment_location_id), name: t.name, description: t.description ?? null, priority: t.priority ?? 'medium', due_date: t.due_date ?? null })),
    positions: [...positions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(p => /** @type {any} */ ({
      key: positionKeys.add(p.id), site_key: siteKeys.of(p.site_id), supervisor_id: p.supervisor_position_id ?? null, supervisor_key: null,
      name: p.name, tactical_callsign: p.tactical_callsign ?? null, position_type: p.position_type ?? null, net: p.net ?? null, headcount: p.headcount ?? 1,
      requirements: Array.isArray(p.requirements) ? p.requirements : [], briefing_notes: p.briefing_notes ?? null, sort_order: p.sort_order ?? 0, open_signup: p.open_signup !== false,
    })),
    shifts: shifts.map(s => ({ position_key: positionKeys.of(s.position_id), period_key: periodKeys.of(s.operational_period_id), starts_at: s.starts_at, ends_at: s.ends_at, muster_at: s.muster_at ?? null, headcount: s.headcount ?? null, notes: s.notes ?? null })),
    channels: [],
    comms_plans: [],
    map_layers: [...layers].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(l => ({ name: l.name, kind: l.kind ?? 'mixed', color: l.color ?? null, geojson: l.geojson, source_file: l.source_file ?? null, sort_order: l.sort_order ?? 0 })),
    objectives: objectives.filter(o => o.status !== 'dropped').map(o => ({ title: o.title, description: o.description ?? null, category: o.category ?? null, points: o.points ?? null, sort_order: o.sort_order ?? 0 })),
    safety_checklist: safety ? { template_name: safety.template_name ?? null, items: (safety.items ?? []).map(i => ({ text: i.text })), notes: safety.notes ?? null } : null,
  };
  // Supervisor links by key (second pass, once every position has a key).
  for (const p of bundle.positions) { p.supervisor_key = positionKeys.of(p.supervisor_id); delete p.supervisor_id; }
  // Only the library channels the plan references travel with the file.
  const channelById = new Map(channels.map(c => [c.id, c]));
  for (const plan of plans) {
    const rows = planRows.filter(r => r.comms_plan_id === plan.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const planKey = planKeys.add(plan.id);
    bundle.comms_plans.push({
      key: planKey, period_key: periodKeys.of(plan.operational_period_id), name: plan.name ?? 'Communications plan',
      special_instructions: plan.special_instructions ?? null, prepared_by_position: plan.prepared_by_position ?? null,
      rows: rows.map(r => {
        const ch = r.channel_id ? channelById.get(r.channel_id) : null;
        let channelKey = ch ? channelKeys.of(ch.id) : null;
        if (ch && !channelKey) { channelKey = channelKeys.add(ch.id); bundle.channels.push({ key: channelKey, ...pick(ch, CHANNEL_FIELDS) }); }
        return { channel_key: channelKey, ...pick(r, PLAN_ROW_FIELDS) };
      }),
    });
  }
  return bundle;
}

/** Headline numts for a preview. */
export function bundleCounts(bundle) {
  return {
    sites: bundle.sites?.length ?? 0, positions: bundle.positions?.length ?? 0, shifts: bundle.shifts?.length ?? 0, periods: bundle.periods?.length ?? 0,
    items: bundle.items?.length ?? 0, tasks: bundle.tasks?.length ?? 0, channels: bundle.channels?.length ?? 0,
    planRows: (bundle.comms_plans ?? []).reduce((n, p) => n + (p.rows?.length ?? 0), 0), layers: bundle.map_layers?.length ?? 0,
    objectives: bundle.objectives?.length ?? 0, safety: bundle.safety_checklist ? 1 : 0,
  };
}

/**
 * Read a file's text (or an already parsed object) into a bundle.
 * @returns {{ error: string, bundle?: undefined } | { error?: undefined, bundle: Object, counts: ReturnType<typeof bundleCounts> }}
 */
export function parseBundle(input) {
  let doc = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return { error: 'Not a JSON file' }; }
  }
  if (!doc || typeof doc !== 'object' || doc.format !== BUNDLE_FORMAT) return { error: 'Not an EmComm Planner deployment file' };
  if (typeof doc.version !== 'number' || doc.version > BUNDLE_VERSION) return { error: `This file needs a newer EmComm Planner (file version ${doc.version})` };
  if (!doc.deployment || typeof doc.deployment.name !== 'string' || !doc.deployment.name.trim()) return { error: 'The file has no deployment name' };
  const arrays = ['periods', 'sites', 'categories', 'items', 'tasks', 'positions', 'shifts', 'channels', 'comms_plans', 'map_layers', 'objectives'];
  for (const k of arrays) if (doc[k] != null && !Array.isArray(doc[k])) return { error: `Malformed file: ${k} is not a list` };
  const bundle = { ...doc };
  for (const k of arrays) bundle[k] = doc[k] ?? [];
  return { bundle, counts: bundleCounts(bundle) };
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
const sameFreq = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.00051);

/**
 * Create a deployment from a bundle. Optional `newStartsAt` moves every
 * timestamp by the same offset (like Duplicate). Library channels are matched
 * by name and receive frequency in the target group and created when absent,
 * so the plan keeps working links.
 *
 * @param {Object} repos db repositories
 * @param {Object} bundle from parseBundle
 * @param {{ groupId: string, createdBy?: string|null, name?: string|null, newStartsAt?: string|null, existingChannels?: Object[], createTask?: (task: Object) => Promise<any> }} options
 */
export async function importBundle(repos, bundle, { groupId, createdBy = null, name = null, newStartsAt = null, existingChannels = [], createTask }) {
  const src = bundle.deployment;
  const anchor = src.starts_at || bundle.periods[0]?.starts_at || bundle.shifts[0]?.starts_at || null;
  const delta = newStartsAt && anchor ? new Date(newStartsAt).getTime() - new Date(anchor).getTime() : 0;
  const move = (iso) => (delta ? shiftIso(iso, delta) : iso ?? null);
  const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null);
  const moveDate = (d) => (d && delta ? dateOf(shiftIso(`${d}T12:00:00Z`, delta)) : d ?? null);

  const deployment = await repos.deployments.create({
    name: (name || src.name).trim(), description: src.description ?? null, location: src.location ?? null, ares_group_id: groupId,
    profile: src.profile ?? 'public_service', served_agency: src.served_agency ?? null, requesting_official: src.requesting_official ?? null,
    tasking_reference: src.tasking_reference ?? null, status: 'planning',
    starts_at: move(src.starts_at), ends_at: move(src.ends_at), start_date: dateOf(move(src.starts_at)), end_date: dateOf(move(src.ends_at)),
    created_by: createdBy,
  });
  const counts = { sites: 0, categories: 0, items: 0, tasks: 0, periods: 0, positions: 0, shifts: 0, channels: 0, channelsCreated: 0, planRows: 0, layers: 0, objectives: 0, safety: 0 };

  const periodIds = new Map();
  if (repos.operationalPeriods) {
    for (const p of bundle.periods) {
      const created = await repos.operationalPeriods.create({ deployment_id: deployment.id, sequence: p.sequence ?? periodIds.size + 1, label: p.label ?? null, starts_at: move(p.starts_at), ends_at: move(p.ends_at) });
      periodIds.set(p.key, created.id); counts.periods += 1;
    }
  }

  const siteIds = new Map();
  for (const s of bundle.sites) {
    const created = await repos.locations.create({
      deployment_id: deployment.id, name: s.name, description: s.description ?? null, address: s.address ?? null, contact_person: s.contact_person ?? null, site_type: s.site_type ?? null,
      lat: s.lat ?? null, lon: s.lon ?? null, parking_notes: s.parking_notes ?? null, arrival_notes: s.arrival_notes ?? null, access_notes: s.access_notes ?? null, sort_order: s.sort_order ?? 0, assigned_call_signs: [],
    });
    siteIds.set(s.key, created.id); counts.sites += 1;
  }

  const categoryIds = new Map();
  for (const c of bundle.categories) {
    const created = await repos.categories.create({ deployment_id: deployment.id, name: c.name, color: c.color ?? null, description: c.description ?? null, sort_order: c.sort_order ?? 0 });
    categoryIds.set(c.key, created.id); counts.categories += 1;
  }
  for (const i of bundle.items) {
    await repos.items.create({ name: i.name, description: i.description ?? null, quantity: i.quantity ?? 1, priority: i.priority ?? null, sort_order: i.sort_order ?? 0, category_id: categoryIds.get(i.category_key) ?? null, deployment_location_id: siteIds.get(i.site_key) ?? null, assigned_to: [] });
    counts.items += 1;
  }
  for (const t of bundle.tasks) {
    const locationId = siteIds.get(t.site_key);
    if (!locationId) continue;
    const task = { name: t.name, description: t.description ?? null, priority: t.priority ?? 'medium', status: 'pending', due_date: moveDate(t.due_date), assigned_to_call_sign: null, deployment_location_id: locationId, deployment_id: deployment.id };
    if (createTask) await createTask(task); else if (repos.tasks) await repos.tasks.create(task); else continue;
    counts.tasks += 1;
  }

  const positionIds = new Map();
  if (repos.positions) {
    for (const p of bundle.positions) {
      const created = await repos.positions.create({
        deployment_id: deployment.id, site_id: siteIds.get(p.site_key) ?? null, name: p.name, tactical_callsign: p.tactical_callsign ?? null, position_type: p.position_type ?? null, net: p.net ?? null,
        headcount: p.headcount ?? 1, requirements: Array.isArray(p.requirements) ? p.requirements : [], briefing_notes: p.briefing_notes ?? null, sort_order: p.sort_order ?? 0, open_signup: p.open_signup !== false,
      });
      positionIds.set(p.key, created.id); counts.positions += 1;
    }
    if (repos.positions.update) {
      for (const p of bundle.positions) {
        if (p.supervisor_key && positionIds.has(p.supervisor_key)) await repos.positions.update(positionIds.get(p.key), { supervisor_position_id: positionIds.get(p.supervisor_key) });
      }
    }
    if (repos.shifts) {
      for (const s of bundle.shifts) {
        const positionId = positionIds.get(s.position_key);
        if (!positionId) continue;
        await repos.shifts.create({ position_id: positionId, deployment_id: deployment.id, operational_period_id: s.period_key ? periodIds.get(s.period_key) ?? null : null, starts_at: move(s.starts_at), ends_at: move(s.ends_at), muster_at: move(s.muster_at), headcount: s.headcount ?? null, notes: s.notes ?? null });
        counts.shifts += 1;
      }
    }
  }

  // Channels: reuse the group's library where a row matches, create the rest.
  const channelIds = new Map();
  if (repos.channels && bundle.channels.length) {
    let order = Math.max(0, ...existingChannels.map(c => c.sort_order || 0));
    for (const ch of bundle.channels) {
      const found = existingChannels.find(c => norm(c.name) === norm(ch.name) && sameFreq(c.rx_freq, ch.rx_freq) && (ch.config !== 'phone' || norm(c.phone_number) === norm(ch.phone_number)));
      if (found) { channelIds.set(ch.key, found.id); counts.channels += 1; continue; }
      order += 1;
      const created = await repos.channels.create({ ...pick(ch, CHANNEL_FIELDS), ares_group_id: groupId, active: true, sort_order: order });
      channelIds.set(ch.key, created.id); counts.channels += 1; counts.channelsCreated += 1;
    }
  }
  if (repos.commsPlans && repos.commsPlanChannels) {
    for (const plan of bundle.comms_plans) {
      const created = await repos.commsPlans.create({
        deployment_id: deployment.id, name: plan.name ?? 'Communications plan', operational_period_id: plan.period_key ? periodIds.get(plan.period_key) ?? null : null,
        special_instructions: plan.special_instructions ?? null, prepared_by_name: null, prepared_by_position: plan.prepared_by_position ?? 'COML',
      });
      for (const r of plan.rows ?? []) {
        await repos.commsPlanChannels.create({ ...pick(r, PLAN_ROW_FIELDS), channel_id: r.channel_key ? channelIds.get(r.channel_key) ?? null : null, comms_plan_id: created.id, deployment_id: deployment.id });
        counts.planRows += 1;
      }
    }
  }

  if (repos.mapLayers) {
    for (const l of bundle.map_layers) {
      if (!l.geojson) continue;
      await repos.mapLayers.create({ deployment_id: deployment.id, name: l.name, kind: l.kind ?? 'mixed', color: l.color ?? null, geojson: l.geojson, source_file: l.source_file ?? null, sort_order: l.sort_order ?? counts.layers, created_by: createdBy });
      counts.layers += 1;
    }
  }
  if (repos.objectives) {
    for (const o of bundle.objectives) {
      await repos.objectives.create({ deployment_id: deployment.id, title: o.title, description: o.description ?? null, category: o.category ?? null, points: o.points ?? null, status: 'open', sort_order: o.sort_order ?? 0, created_by: createdBy });
      counts.objectives += 1;
    }
  }
  if (repos.safetyChecklists && bundle.safety_checklist?.items?.length) {
    await repos.safetyChecklists.create({
      deployment_id: deployment.id, template_name: bundle.safety_checklist.template_name ?? null, notes: bundle.safety_checklist.notes ?? null, created_by: createdBy,
      items: bundle.safety_checklist.items.map((i, idx) => ({ id: `s${idx + 1}`, text: i.text, state: 'pending', note: null })),
    });
    counts.safety = 1;
  }

  return { deployment, counts, shiftedDays: delta ? Math.round(delta / 86_400_000) : 0 };
}
