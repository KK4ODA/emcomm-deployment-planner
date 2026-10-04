-- 025_exercise_readiness.sql
--
-- The seven gaps the Atlanta UASI exercise of 2026-10-01 exposed, where the
-- planning happened over e-mail and the day-before scramble started with
-- three operators who could not be registered with the host agency.
--
--   1. Registration with the served agency, tracked per operator, with a
--      deadline, so a rejection surfaces in readiness and not the night before.
--   2. A digital (Winlink) address per position, with a check interval, so
--      written traffic has an agreed destination.
--   3. Monitor-only channels, so a plan can carry the channels a team must
--      listen to but never transmit on.
--   5. A minimum team size per deployment, so no team deploys with too few
--      operators to hold a net and raise antennas at once.
--   6. Read-only share links for partners who have no account.
--   7. An evaluation per objective (met / partly met / not met), which the
--      after-action report assembles into the objectives table.
--
-- (4, the ICS 219 cards, is client-side rendering and needs no schema.)

-- 1. Registration with the host or served agency ------------------------------

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS registration_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registration_url TEXT,
  ADD COLUMN IF NOT EXISTS registration_notes TEXT,
  ADD COLUMN IF NOT EXISTS min_team_size INTEGER
    CONSTRAINT deployments_min_team_size_sane CHECK (min_team_size IS NULL OR (min_team_size BETWEEN 1 AND 20));

COMMENT ON COLUMN deployments.registration_required IS 'The served agency keeps its own participant roster; operators must be registered with them as well as assigned here.';
COMMENT ON COLUMN deployments.min_team_size IS 'Readiness warns about a staffed position with fewer operators than this (UASI lesson: never fewer than three).';

CREATE TABLE IF NOT EXISTS deployment_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'not_submitted'
                CHECK (status IN ('not_submitted', 'submitted', 'confirmed', 'rejected', 'not_required')),
  reference     TEXT,
  note          TEXT,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, user_id)
);
CREATE INDEX IF NOT EXISTS deployment_registrations_deployment_idx ON deployment_registrations (deployment_id);
DROP TRIGGER IF EXISTS deployment_registrations_updated_at ON deployment_registrations;
CREATE TRIGGER deployment_registrations_updated_at BEFORE UPDATE ON deployment_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE deployment_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deployment_registrations_select" ON deployment_registrations;
CREATE POLICY "deployment_registrations_select" ON deployment_registrations FOR SELECT TO authenticated
  USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "deployment_registrations_write" ON deployment_registrations;
CREATE POLICY "deployment_registrations_write" ON deployment_registrations FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- 2. Digital addressing per position ------------------------------------------

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS winlink_address TEXT,
  ADD COLUMN IF NOT EXISTS digital_check_minutes INTEGER
    CONSTRAINT positions_digital_check_sane CHECK (digital_check_minutes IS NULL OR (digital_check_minutes BETWEEN 1 AND 1440));

COMMENT ON COLUMN positions.winlink_address IS 'Winlink address or tactical mailbox written traffic for this unit goes to.';
COMMENT ON COLUMN positions.digital_check_minutes IS 'How often this unit promises to check it.';

-- 3. Monitor-only channels -----------------------------------------------------

ALTER TABLE comms_plan_channels
  ADD COLUMN IF NOT EXISTS monitor_only BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN comms_plan_channels.monitor_only IS 'Listen, never transmit: agency and interoperability channels we are given to follow.';

-- 7. Objective evaluation ------------------------------------------------------

ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS evaluation TEXT
    CONSTRAINT objectives_evaluation_check CHECK (evaluation IS NULL OR evaluation IN ('met', 'partly_met', 'not_met', 'not_exercised')),
  ADD COLUMN IF NOT EXISTS evaluation_note TEXT;

-- 6. Read-only share links -----------------------------------------------------
-- Only the hash of the token is stored, as for APRS bridge tokens. The public
-- Edge Function reads through these rows with the service role; no anonymous
-- role ever touches the deployment tables.

CREATE TABLE IF NOT EXISTS deployment_shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id    UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  token_hash       TEXT NOT NULL UNIQUE,
  include_contacts BOOLEAN NOT NULL DEFAULT false,
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  last_viewed_at   TIMESTAMPTZ,
  view_count       INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployment_shares_deployment_idx ON deployment_shares (deployment_id);

ALTER TABLE deployment_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deployment_shares_select" ON deployment_shares;
CREATE POLICY "deployment_shares_select" ON deployment_shares FOR SELECT TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id));
DROP POLICY IF EXISTS "deployment_shares_write" ON deployment_shares;
CREATE POLICY "deployment_shares_write" ON deployment_shares FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- The planner calls this to mint a link; the token is returned once.
CREATE OR REPLACE FUNCTION create_deployment_share(p_deployment_id UUID, p_label TEXT, p_include_contacts BOOLEAN DEFAULT false, p_expires_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE tok TEXT; row_id UUID;
BEGIN
  IF NOT (has_role('admin', 'planner') AND deployment_visible(p_deployment_id)) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  tok := 'eds_' || encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO deployment_shares (deployment_id, label, token_hash, include_contacts, expires_at, created_by)
  VALUES (p_deployment_id, COALESCE(NULLIF(btrim(p_label), ''), 'Shared link'), encode(extensions.digest(tok, 'sha256'), 'hex'), COALESCE(p_include_contacts, false), p_expires_at, auth.uid())
  RETURNING id INTO row_id;
  RETURN jsonb_build_object('id', row_id, 'token', tok);
END;
$$;
REVOKE ALL ON FUNCTION create_deployment_share(UUID, TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_deployment_share(UUID, TEXT, BOOLEAN, TIMESTAMPTZ) TO authenticated;

-- What a share link may show. Service role only; the Edge Function calls it.
CREATE OR REPLACE FUNCTION public_deployment_view(p_token_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sh_row deployment_shares; d deployments; res JSONB;
BEGIN
  SELECT * INTO sh_row FROM deployment_shares WHERE token_hash = p_token_hash;
  IF NOT FOUND OR sh_row.revoked_at IS NOT NULL OR (sh_row.expires_at IS NOT NULL AND sh_row.expires_at < now()) THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  SELECT * INTO d FROM deployments WHERE id = sh_row.deployment_id;
  UPDATE deployment_shares SET view_count = view_count + 1, last_viewed_at = now() WHERE id = sh_row.id;

  res := jsonb_build_object(
    'deployment', jsonb_build_object(
      'name', d.name, 'status', d.status, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
      'location', d.location, 'served_agency', d.served_agency, 'description', d.description,
      'map_url', d.map_url, 'plan_version', d.plan_version, 'plan_published_at', d.plan_published_at,
      'registration_required', d.registration_required, 'registration_notes', d.registration_notes),
    'label', sh_row.label,
    'include_contacts', sh_row.include_contacts,
    'periods', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', p.label, 'starts_at', p.starts_at, 'ends_at', p.ends_at) ORDER BY p.sequence)
                           FROM operational_periods p WHERE p.deployment_id = d.id), '[]'::jsonb),
    'sites', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'name', l.name, 'address', l.address, 'site_type', l.site_type,
                            'lat', l.lat, 'lon', l.lon, 'arrival_notes', l.arrival_notes,
                            'parking_notes', l.parking_notes, 'description', l.description,
                            'contact_person', CASE WHEN sh_row.include_contacts THEN l.contact_person ELSE NULL END)
                          ORDER BY l.sort_order)
                        FROM deployment_locations l WHERE l.deployment_id = d.id), '[]'::jsonb),
    'units', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'name', po.name, 'tactical_callsign', po.tactical_callsign, 'net', po.net,
                            'site', (SELECT l2.name FROM deployment_locations l2 WHERE l2.id = po.site_id),
                            'winlink_address', po.winlink_address,
                            'leader', CASE WHEN sh_row.include_contacts THEN (
                               SELECT u.call_sign FROM assignments a
                                 JOIN shifts sh ON sh.id = a.shift_id
                                 JOIN users u ON u.id = a.user_id
                                WHERE sh.position_id = po.id AND a.status IN ('accepted','checked_in','on_position')
                                ORDER BY sh.starts_at LIMIT 1) ELSE NULL END)
                          ORDER BY po.sort_order)
                        FROM positions po WHERE po.deployment_id = d.id), '[]'::jsonb)
  );
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public_deployment_view(TEXT) FROM PUBLIC, anon, authenticated;
