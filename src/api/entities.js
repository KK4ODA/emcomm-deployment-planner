import { supabase } from './supabaseClient';

/**
 * Parse Base44-style sort string into Supabase order params.
 * Base44 uses '-field_name' for descending, 'field_name' for ascending.
 * Also maps Base44 field names to Supabase column names.
 */
function parseSortField(sortField) {
  if (!sortField) return null;
  const ascending = !sortField.startsWith('-');
  const field = sortField.replace(/^-/, '');
  // Map Base44 field names to Supabase column names
  const fieldMap = {
    'created_date': 'created_at',
    'updated_date': 'updated_at',
  };
  return { field: fieldMap[field] || field, ascending };
}

/**
 * Create an entity accessor that mimics the Base44 SDK interface:
 *   entity.list(sortField?)
 *   entity.filter(criteria, sortField?)
 *   entity.create(data)
 *   entity.update(id, data)
 *   entity.delete(id)
 *   entity.subscribe(callback)
 */
function createEntity(tableName) {
  return {
    /**
     * List all rows, optionally sorted.
     * @param {string} [sortField] - e.g. 'sort_order', '-created_date'
     */
    async list(sortField) {
      let query = supabase.from(tableName).select('*');
      const sort = parseSortField(sortField);
      if (sort) {
        query = query.order(sort.field, { ascending: sort.ascending });
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    /**
     * Filter rows by criteria object.
     * Base44 uses { field: value } for equality filters.
     * @param {Object} criteria - e.g. { deployment_id: '123' }
     * @param {string} [sortField]
     */
    async filter(criteria, sortField) {
      let query = supabase.from(tableName).select('*');
      for (const [key, value] of Object.entries(criteria)) {
        query = query.eq(key, value);
      }
      const sort = parseSortField(sortField);
      if (sort) {
        query = query.order(sort.field, { ascending: sort.ascending });
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    /**
     * Create a new row.
     * @param {Object} data
     * @returns {Object} The created row
     */
    async create(data) {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },

    /**
     * Update a row by ID.
     * @param {string} id
     * @param {Object} data
     * @returns {Object} The updated row
     */
    async update(id, data) {
      // Remove read-only fields that shouldn't be sent to the database
      const { id: _id, created_at, updated_at, created_date, updated_date, created_by, ...updateData } = data;
      const { data: result, error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },

    /**
     * Delete a row by ID.
     * @param {string} id
     */
    async delete(id) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },

    /**
     * Subscribe to real-time changes on this table.
     * Returns an unsubscribe function.
     * @param {Function} callback - Called with change event
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
      const channel = supabase
        .channel(`${tableName}-changes-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: tableName
        }, (payload) => {
          callback({
            type: payload.eventType,
            data: payload.new,
            old_data: payload.old
          });
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  };
}

// Entity map matching Base44 entity names to Supabase table names
export const entities = {
  User: createEntity('users'),
  Deployment: createEntity('deployments'),
  DeploymentLocation: createEntity('deployment_locations'),
  Category: createEntity('categories'),
  DeploymentItem: createEntity('deployment_items'),
  Task: createEntity('tasks'),
  DeploymentTemplate: createEntity('deployment_templates'),
  ICS205Form: createEntity('ics205_forms'),
  Notification: createEntity('notifications'),
  ARESGroup: createEntity('ares_groups'),
};
