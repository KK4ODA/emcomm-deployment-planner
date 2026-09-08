-- 021_aprs.sql
-- APRS integration through Graywolf (design doc 13.3, P3 row "APRS position
-- ingestion", widened by the owner to a full integration):
--   positions in   : a bridge next to Graywolf forwards heard stations
--   check-ins in   : Graywolf Actions call our webhook for @@#checkin etc.
--   messages out   : notifications for operators who chose APRS delivery
--   objects out    : the deployment's sites as APRS objects for emcomm-objects
-- The bridge authenticates with a per-group token; only its SHA-256 is kept.
-- APRS is display and convenience, never the source of truth for check-in:
-- an APRS check-in still goes through the same assignment ladder and log.

-- ============================================================
-- 1. Bridges (one token per Graywolf station)
-- ============================================================
CREATE TABLE IF NOT EXISTS aprs_bridges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id  UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  token_hash     TEXT NOT NULL UNIQUE,
  station_call   TEXT,                       -- Graywolf's own callsign-SSID, reported by the bridge
  last_seen_at   TIMESTAMPTZ,
  last_stations  INTEGER,
  last_error     TEXT,
  revoked_at     TIMESTAMPTZ,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE aprs_bridges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aprs_bridges_select" ON aprs_bridges;
CREATE POLICY "aprs_bridges_select" ON aprs_bridges FOR SELECT TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "aprs_bridges_write" ON aprs_bridges;
CREATE POLICY "aprs_bridges_write" ON aprs_bridges FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));

-- ============================================================
-- 2. Heard stations (latest fix per callsign; history kept 14 days)
-- ============================================================
CREATE TABLE IF NOT EXISTS aprs_positions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id  UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  bridge_id      UUID REFERENCES aprs_bridges(id) ON DELETE SET NULL,
  callsign       TEXT NOT NULL,              -- as heard, with SSID, e.g. KK4ODA-9
  base_call      TEXT NOT NULL,              -- KK4ODA
  lat            DOUBLE PRECISION,
  lon            DOUBLE PRECISION,
  course         REAL,
  speed_kt       REAL,
  alt_m          REAL,
  symbol         TEXT,                       -- table + code, e.g. "/>"
  comment        TEXT,
  is_object      BOOLEAN NOT NULL DEFAULT false,
  via            TEXT,                       -- rf | is | unknown
  heard_at       TIMESTAMPTZ NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ares_group_id, callsign, heard_at)
);
CREATE INDEX IF NOT EXISTS aprs_positions_latest_idx ON aprs_positions (ares_group_id, callsign, heard_at DESC);
CREATE INDEX IF NOT EXISTS aprs_positions_heard_idx ON aprs_positions (heard_at);
ALTER TABLE aprs_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aprs_positions_select" ON aprs_positions;
CREATE POLICY "aprs_positions_select" ON aprs_positions FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));
-- Written only by the aprs-ingest Edge Function (service role).

CREATE OR REPLACE VIEW aprs_positions_latest AS
  SELECT DISTINCT ON (ares_group_id, callsign) *
    FROM aprs_positions
   ORDER BY ares_group_id, callsign, heard_at DESC;
ALTER VIEW aprs_positions_latest SET (security_invoker = true);
GRANT SELECT ON aprs_positions_latest TO authenticated;

-- ============================================================
-- 3. Inbound actions (check-ins over APRS) and outbound messages
-- ============================================================
CREATE TABLE IF NOT EXISTS aprs_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id  UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  bridge_id      UUID REFERENCES aprs_bridges(id) ON DELETE SET NULL,
  from_callsign  TEXT NOT NULL,
  action         TEXT NOT NULL,
  args           JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  assignment_id  UUID REFERENCES assignments(id) ON DELETE SET NULL,
  result         TEXT NOT NULL,              -- ok | unknown_callsign | no_assignment | not_allowed | error
  reply          TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aprs_actions_group_idx ON aprs_actions (ares_group_id, received_at DESC);
ALTER TABLE aprs_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aprs_actions_select" ON aprs_actions;
CREATE POLICY "aprs_actions_select" ON aprs_actions FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));

CREATE TABLE IF NOT EXISTS aprs_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id  UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  to_callsign    TEXT NOT NULL,
  text           TEXT NOT NULL,              -- <= 67 chars (APRS message body)
  notification_id UUID,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'expired')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + interval '6 hours'
);
CREATE INDEX IF NOT EXISTS aprs_outbox_pending_idx ON aprs_outbox (ares_group_id, status, created_at);
ALTER TABLE aprs_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aprs_outbox_select" ON aprs_outbox;
CREATE POLICY "aprs_outbox_select" ON aprs_outbox FOR SELECT TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));

-- ============================================================
-- 4. Apply an APRS check-in on behalf of an operator (service role only)
-- ============================================================
-- The deliver path runs as the service role, which has no auth.uid(); this
-- function applies the same ladder as set_assignment_status for a named
-- user, logs it with kind 'aprs', and returns a short reply for the radio.
CREATE OR REPLACE FUNCTION apply_aprs_status(p_user_id UUID, p_status TEXT, p_at TIMESTAMPTZ DEFAULT now(), p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a assignments%ROWTYPE;
  pos_name TEXT; tac TEXT; rank_now INT; rank_new INT;
BEGIN
  IF p_status NOT IN ('checked_in', 'on_position', 'released') THEN
    RETURN jsonb_build_object('result', 'not_allowed', 'reply', 'unknown status');
  END IF;
  -- The operator's live assignment: running now, else the next one today.
  SELECT a2.* INTO a
    FROM assignments a2
    JOIN shifts s ON s.id = a2.shift_id
    JOIN deployments d ON d.id = a2.deployment_id
   WHERE a2.user_id = p_user_id
     AND a2.status IN ('accepted', 'checked_in', 'on_position')
     AND d.status IN ('planning', 'active')
     AND s.ends_at > p_at - interval '2 hours'
     AND s.starts_at < p_at + interval '12 hours'
   ORDER BY (s.starts_at <= p_at AND s.ends_at >= p_at) DESC, s.starts_at
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'no_assignment', 'reply', 'no shift found for you today');
  END IF;
  SELECT p.name, p.tactical_callsign INTO pos_name, tac FROM shifts s JOIN positions p ON p.id = s.position_id WHERE s.id = a.shift_id;

  rank_now := CASE a.status WHEN 'accepted' THEN 1 WHEN 'checked_in' THEN 2 WHEN 'on_position' THEN 3 ELSE 9 END;
  rank_new := CASE p_status WHEN 'checked_in' THEN 2 WHEN 'on_position' THEN 3 WHEN 'released' THEN 4 END;
  IF rank_new <= rank_now THEN
    RETURN jsonb_build_object('result', 'ok', 'assignment_id', a.id, 'reply', format('already %s at %s', replace(a.status, '_', ' '), COALESCE(tac, pos_name)));
  END IF;

  PERFORM set_config('emcomm.logged', 'on', true);
  UPDATE assignments
     SET status = p_status,
         checked_in_at  = CASE WHEN p_status IN ('checked_in', 'on_position') THEN COALESCE(checked_in_at, p_at) ELSE checked_in_at END,
         on_position_at = CASE WHEN p_status = 'on_position' THEN COALESCE(on_position_at, p_at) ELSE on_position_at END,
         released_at    = CASE WHEN p_status = 'released' THEN COALESCE(released_at, p_at) ELSE released_at END
   WHERE id = a.id RETURNING * INTO a;
  PERFORM set_config('emcomm.logged', 'off', true);
  INSERT INTO activity_log (deployment_id, assignment_id, position_id, user_id, recorded_by, kind, summary, occurred_at, intent_id)
  SELECT a.deployment_id, a.id, s.position_id, a.user_id, NULL,
         CASE p_status WHEN 'checked_in' THEN 'check_in' WHEN 'on_position' THEN 'on_position' ELSE 'check_out' END,
         format('%s %s via APRS%s', COALESCE((SELECT call_sign FROM users WHERE id = a.user_id), 'operator'), replace(p_status, '_', ' '), CASE WHEN p_note IS NOT NULL THEN ': ' || p_note ELSE '' END),
         p_at, 'aprs:' || a.id || ':' || p_status || ':' || to_char(p_at, 'YYYYMMDDHH24MI')
    FROM shifts s WHERE s.id = a.shift_id
  ON CONFLICT (intent_id) DO NOTHING;
  -- hours: the assignments status trigger derives them on release
  RETURN jsonb_build_object('result', 'ok', 'assignment_id', a.id, 'reply', format('%s %s %s', COALESCE(tac, pos_name), replace(p_status, '_', ' '), to_char(p_at AT TIME ZONE 'UTC', 'HH24:MI') || 'z'));
END;
$$;
REVOKE ALL ON FUNCTION apply_aprs_status(UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;

-- Notification delivery: queue an APRS message when the operator chose it.
-- (deliver-notification reads prefs.aprs and users.aprs_call_sign and
-- inserts into aprs_outbox with the service role; no trigger needed.)
