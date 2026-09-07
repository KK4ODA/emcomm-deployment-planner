import { supabase } from './supabaseClient';

/**
 * Table names in the Supabase project. Keep in sync with supabase/migrations.
 */
export const TABLES = Object.freeze({
  users: 'users',
  deployments: 'deployments',
  locations: 'deployment_locations',
  categories: 'categories',
  items: 'deployment_items',
  tasks: 'tasks',
  templates: 'deployment_templates',
  notifications: 'notifications',
  aresGroups: 'ares_groups',
  memberships: 'memberships',
  operationalPeriods: 'operational_periods',
  positions: 'positions',
  shifts: 'shifts',
  assignments: 'assignments',
  channels: 'channels',
  commsPlans: 'comms_plans',
  commsPlanChannels: 'comms_plan_channels',
  activityLog: 'activity_log',
  hourEntries: 'hour_entries',
  feedback: 'feedback',
  lessons: 'lessons',
  mapLayers: 'map_layers',
});

/** Columns the database owns; they are never sent back on update. */
const READ_ONLY_COLUMNS = ['id', 'created_at', 'updated_at', 'created_by'];

/**
 * @typedef {Object} ListOptions
 * @property {string} [orderBy] column to sort by
 * @property {boolean} [ascending=true]
 */

/**
 * @typedef {Object} ChangeEvent
 * @property {'INSERT'|'UPDATE'|'DELETE'} type
 * @property {Object|null} data new row (null on DELETE)
 * @property {Object|null} oldData previous row (only the primary key unless replica identity is FULL)
 */

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/** @param {any} query @param {ListOptions} [options] */
function applyOrder(query, { orderBy, ascending = true } = {}) {
  return orderBy ? query.order(orderBy, { ascending }) : query;
}

export function stripReadOnly(data) {
  const copy = { ...data };
  for (const col of READ_ONLY_COLUMNS) delete copy[col];
  return copy;
}

/**
 * Create a small repository for one table. Every method throws the Supabase
 * error on failure so React Query surfaces it through `onError`.
 *
 * @template T
 * @param {string} table
 */
export function createRepository(table) {
  return {
    table,

    /** @param {ListOptions} [options] @returns {Promise<T[]>} */
    async list(options) {
      const rows = await applyOrder(supabase.from(table).select('*'), options);
      return unwrap(rows) ?? [];
    },

    /** @param {string} id @returns {Promise<T|null>} */
    async findById(id) {
      if (!id) return null;
      return unwrap(await supabase.from(table).select('*').eq('id', id).maybeSingle());
    },

    /**
     * Rows matching every `column = value` pair in `criteria`.
     * @param {Record<string, unknown>} criteria
     * @param {ListOptions} [options]
     * @returns {Promise<T[]>}
     */
    async where(criteria, options) {
      let query = supabase.from(table).select('*');
      for (const [column, value] of Object.entries(criteria)) query = query.eq(column, value);
      return unwrap(await applyOrder(query, options)) ?? [];
    },

    /** @param {Partial<T>} data @returns {Promise<T>} */
    async create(data) {
      return unwrap(await supabase.from(table).insert(data).select().single());
    },

    /** @param {string} id @param {Partial<T>} data @returns {Promise<T>} */
    async update(id, data) {
      return unwrap(await supabase.from(table).update(stripReadOnly(data)).eq('id', id).select().single());
    },

    /** @param {string} id */
    async remove(id) {
      unwrap(await supabase.from(table).delete().eq('id', id));
    },

    /**
     * Subscribe to Realtime changes on this table.
     * @param {(event: ChangeEvent) => void} callback
     * @returns {() => void} unsubscribe
     */
    subscribe(callback) {
      const channel = supabase
        .channel(`${table}-changes-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          callback({ type: payload.eventType, data: payload.new ?? null, oldData: payload.old ?? null });
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    },
  };
}

/** Repositories for every application table. */
export const db = Object.freeze({
  users: createRepository(TABLES.users),
  deployments: createRepository(TABLES.deployments),
  locations: createRepository(TABLES.locations),
  categories: createRepository(TABLES.categories),
  items: createRepository(TABLES.items),
  tasks: createRepository(TABLES.tasks),
  templates: createRepository(TABLES.templates),
  notifications: createRepository(TABLES.notifications),
  aresGroups: createRepository(TABLES.aresGroups),
  // Composite key (ares_group_id, user_id): use src/api/memberships.js for writes.
  memberships: createRepository(TABLES.memberships),
  operationalPeriods: createRepository(TABLES.operationalPeriods),
  positions: createRepository(TABLES.positions),
  shifts: createRepository(TABLES.shifts),
  assignments: createRepository(TABLES.assignments),
  channels: createRepository(TABLES.channels),
  commsPlans: createRepository(TABLES.commsPlans),
  commsPlanChannels: createRepository(TABLES.commsPlanChannels),
  activityLog: createRepository(TABLES.activityLog),
  hourEntries: createRepository(TABLES.hourEntries),
  feedback: createRepository(TABLES.feedback),
  lessons: createRepository(TABLES.lessons),
  mapLayers: createRepository(TABLES.mapLayers),
});
