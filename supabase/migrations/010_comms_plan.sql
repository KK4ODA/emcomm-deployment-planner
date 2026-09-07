-- 010: Channel library and deployment-scoped communications plan (Phase 2)
--
-- channels            the ARES group's persistent library (ICS-217A shape)
-- comms_plans         one per deployment (optionally per operational period)
-- comms_plan_channels snapshot of a library channel plus plan-specific use:
--                     function, assignment, net, condition level, PACE role
-- Also: notify assigned operators when a deployment's plan_version changes.
-- The legacy per-site ics205_forms table is left in place (0 rows) and no
-- longer used by the client.

-- ============================================================
-- 1. Channel library
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id     UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,                      -- 'W4BOC 2m', 'RACE', 'Simplex 146.55'
  band              TEXT,                               -- '2m','70cm','1.25m','HF', ...
  config            TEXT NOT NULL DEFAULT 'repeater'
    CHECK (config IN ('repeater', 'simplex', 'digital', 'talkgroup', 'phone', 'other')),
  rx_freq           NUMERIC(12,4),
  rx_tone           TEXT,
  rx_bandwidth      TEXT CHECK (rx_bandwidth IS NULL OR rx_bandwidth IN ('N', 'W')),
  tx_freq           NUMERIC(12,4),
  tx_tone           TEXT,
  tx_bandwidth      TEXT CHECK (tx_bandwidth IS NULL OR tx_bandwidth IN ('N', 'W')),
  mode              TEXT NOT NULL DEFAULT 'A' CHECK (mode IN ('A', 'D', 'M')),
  digital_mode      TEXT,                               -- 'vara_fm','vara_hf','packet','dstar','dmr','fusion','aprs'
  gateway_callsign  TEXT,                               -- 'WD5EMA-10'
  tactical_address  TEXT,                               -- Winlink tactical address
  owner_callsign    TEXT,                               -- repeater trustee, e.g. 'W4BOC'
  phone_number      TEXT,                               -- for config = 'phone' (all-call numbers)
  lat               DOUBLE PRECISION,
  lon               DOUBLE PRECISION,
  timeout_seconds   INTEGER,
  eligible_users    TEXT,
  remarks           TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channels_group_idx ON channels (ares_group_id, active, sort_order);
DROP TRIGGER IF EXISTS channels_updated_at ON channels;
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. Communications plans
-- ============================================================
CREATE TABLE IF NOT EXISTS comms_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id         UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  operational_period_id UUID REFERENCES operational_periods(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL DEFAULT 'Communications plan',
  version               INTEGER NOT NULL DEFAULT 1,
  special_instructions  TEXT,
  prepared_by_name      TEXT,
  prepared_by_position  TEXT DEFAULT 'COML',
  prepared_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_plans_deployment_idx ON comms_plans (deployment_id);
DROP TRIGGER IF EXISTS comms_plans_updated_at ON comms_plans;
CREATE TRIGGER comms_plans_updated_at BEFORE UPDATE ON comms_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS comms_plan_channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comms_plan_id     UUID NOT NULL REFERENCES comms_plans(id) ON DELETE CASCADE,
  deployment_id     UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  channel_id        UUID REFERENCES channels(id) ON DELETE SET NULL,
  sort_order        INTEGER DEFAULT 0,
  -- snapshot of the library row at the time it was added / last synced
  channel_name      TEXT NOT NULL,
  band              TEXT,
  config            TEXT,
  rx_freq           NUMERIC(12,4),
  rx_tone           TEXT,
  rx_bandwidth      TEXT,
  tx_freq           NUMERIC(12,4),
  tx_tone           TEXT,
  tx_bandwidth      TEXT,
  mode              TEXT NOT NULL DEFAULT 'A',
  digital_mode      TEXT,
  gateway_callsign  TEXT,
  tactical_address  TEXT,
  owner_callsign    TEXT,
  phone_number      TEXT,
  timeout_seconds   INTEGER,
  -- plan-specific use (ICS-205 block 4 + the degradation ladder)
  zone_group        TEXT,
  channel_number    TEXT,
  function          TEXT,                              -- 'Command','Tactical','Support','Data','Phone'
  assignment        TEXT,                              -- who uses it: 'All AID stations', 'SAGs and MIKEs'
  net               TEXT,                              -- 'RACE', 'SAG' (matches positions.net)
  condition_level   INTEGER NOT NULL DEFAULT 1 CHECK (condition_level BETWEEN 1 AND 3),
  path_role         TEXT NOT NULL DEFAULT 'primary'
    CHECK (path_role IN ('primary', 'alternate', 'contingency', 'emergency')),
  remarks           TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comms_plan_channels_plan_idx ON comms_plan_channels (comms_plan_id, condition_level, sort_order);
DROP TRIGGER IF EXISTS comms_plan_channels_updated_at ON comms_plan_channels;
CREATE TRIGGER comms_plan_channels_updated_at BEFORE UPDATE ON comms_plan_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE channels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comms_plan_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channels_select" ON channels;
CREATE POLICY "channels_select" ON channels FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "channels_write" ON channels;
CREATE POLICY "channels_write" ON channels FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));

DROP POLICY IF EXISTS "comms_plans_select" ON comms_plans;
CREATE POLICY "comms_plans_select" ON comms_plans FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "comms_plans_write" ON comms_plans;
CREATE POLICY "comms_plans_write" ON comms_plans FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

DROP POLICY IF EXISTS "comms_plan_channels_select" ON comms_plan_channels;
CREATE POLICY "comms_plan_channels_select" ON comms_plan_channels FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "comms_plan_channels_write" ON comms_plan_channels;
CREATE POLICY "comms_plan_channels_write" ON comms_plan_channels FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- ============================================================
-- 4. Publishing a plan notifies everyone assigned to the deployment
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_notify_plan_published()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.plan_version IS DISTINCT FROM OLD.plan_version THEN
    INSERT INTO notifications (user_email, type, title, message)
    SELECT DISTINCT u.email, 'plan_published',
           'Plan updated: ' || NEW.name || ' (v' || NEW.plan_version || ')',
           COALESCE(NULLIF(NEW.plan_change_note, ''), 'Open your packet to see the current plan.')
    FROM assignments a
    JOIN users u ON u.id = a.user_id
    WHERE a.deployment_id = NEW.id
      AND a.status IN ('offered', 'accepted', 'checked_in', 'on_position')
      AND u.email IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION trigger_notify_plan_published() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS deployments_notify_plan ON deployments;
CREATE TRIGGER deployments_notify_plan
  AFTER UPDATE OF plan_version ON deployments
  FOR EACH ROW EXECUTE FUNCTION trigger_notify_plan_published();

-- ============================================================
-- 5. Realtime
-- ============================================================
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE channels; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE comms_plans; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE comms_plan_channels; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
