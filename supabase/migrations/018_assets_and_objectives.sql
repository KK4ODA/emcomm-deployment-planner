-- 018_assets_and_objectives.sql
-- Two group-level features from the design document:
--   9.13 shared asset registry with custody state (the lost-cord problem)
--   9.16 objectives per deployment, claimable, with completion ticks
--
-- Assets belong to the ARES group; custody moves are appended by an RPC any
-- active member can call (trust within the group, every move attributed).
-- Objectives belong to a deployment; planners write them, operators claim
-- and complete their own through an RPC.

-- ============================================================
-- 1. Assets
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id     UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('radio', 'antenna', 'mast', 'power', 'cable', 'computer', 'digital', 'shelter', 'other')),
  serial            TEXT,
  owner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = group-owned
  home_location     TEXT,                                            -- where it lives between events
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'storage' CHECK (status IN ('storage', 'with_person', 'on_site', 'retired')),
  custodian_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deployment_id     UUID REFERENCES deployments(id) ON DELETE SET NULL,
  site_id           UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_group_idx ON assets (ares_group_id, status);
CREATE INDEX IF NOT EXISTS assets_deployment_idx ON assets (deployment_id);
DROP TRIGGER IF EXISTS assets_updated_at ON assets;
CREATE TRIGGER assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS asset_custody (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('checked_out', 'on_site', 'returned', 'transferred', 'retired', 'restored')),
  from_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  site_id       UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  note          TEXT,
  recorded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_custody_asset_idx ON asset_custody (asset_id, at DESC);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_custody ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assets_select" ON assets;
CREATE POLICY "assets_select" ON assets FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "assets_write" ON assets;
CREATE POLICY "assets_write" ON assets FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "asset_custody_select" ON asset_custody;
CREATE POLICY "asset_custody_select" ON asset_custody FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM assets a WHERE a.id = asset_id AND (is_admin() OR a.ares_group_id::text = ANY (get_user_ares_groups(auth.uid())))));
-- Custody rows are written only by move_asset().

-- Move an asset: any active member of the asset's group may record a move
-- (the point is that the record exists), every move is attributed.
CREATE OR REPLACE FUNCTION move_asset(
  p_asset_id UUID,
  p_action TEXT,
  p_to_user_id UUID DEFAULT NULL,
  p_deployment_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS assets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller UUID := auth.uid();
  a assets%ROWTYPE;
  new_status TEXT;
  new_custodian UUID;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT has_role('admin', 'planner', 'operator') THEN
    RAISE EXCEPTION 'Your account cannot move equipment yet' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM assets WHERE id = p_asset_id;
  IF NOT FOUND OR NOT (is_admin() OR a.ares_group_id::text = ANY (get_user_ares_groups(caller))) THEN
    RAISE EXCEPTION 'Asset not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_action NOT IN ('checked_out', 'on_site', 'returned', 'transferred', 'retired', 'restored') THEN
    RAISE EXCEPTION 'Unknown action %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_action IN ('retired', 'restored') AND NOT has_role('admin', 'planner') THEN
    RAISE EXCEPTION 'Only planners retire equipment' USING ERRCODE = '42501';
  END IF;
  IF p_deployment_id IS NOT NULL AND NOT deployment_visible(p_deployment_id) THEN
    RAISE EXCEPTION 'Deployment not found' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'checked_out' THEN new_status := 'with_person'; new_custodian := COALESCE(p_to_user_id, caller);
    WHEN 'transferred' THEN new_status := 'with_person'; new_custodian := p_to_user_id;
    WHEN 'on_site'     THEN new_status := 'on_site';     new_custodian := COALESCE(p_to_user_id, a.custodian_user_id, caller);
    WHEN 'returned'    THEN new_status := 'storage';     new_custodian := NULL;
    WHEN 'retired'     THEN new_status := 'retired';     new_custodian := NULL;
    WHEN 'restored'    THEN new_status := 'storage';     new_custodian := NULL;
  END CASE;
  IF p_action = 'transferred' AND new_custodian IS NULL THEN
    RAISE EXCEPTION 'Say who has it now' USING ERRCODE = '22023';
  END IF;

  INSERT INTO asset_custody (asset_id, action, from_user_id, to_user_id, deployment_id, site_id, note, recorded_by)
  VALUES (a.id, p_action, a.custodian_user_id, new_custodian,
          CASE WHEN p_action IN ('returned', 'retired', 'restored') THEN a.deployment_id ELSE COALESCE(p_deployment_id, a.deployment_id) END,
          CASE WHEN p_action = 'on_site' THEN p_site_id ELSE NULL END,
          NULLIF(btrim(COALESCE(p_note, '')), ''), caller);

  UPDATE assets
     SET status = new_status,
         custodian_user_id = new_custodian,
         deployment_id = CASE WHEN p_action IN ('returned', 'retired', 'restored') THEN NULL ELSE COALESCE(p_deployment_id, deployment_id) END,
         site_id = CASE WHEN p_action = 'on_site' THEN p_site_id WHEN p_action IN ('returned', 'retired', 'restored', 'checked_out', 'transferred') THEN NULL ELSE site_id END,
         status_changed_at = now()
   WHERE id = a.id
   RETURNING * INTO a;
  RETURN a;
END;
$$;
REVOKE ALL ON FUNCTION move_asset(UUID, TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION move_asset(UUID, TEXT, UUID, UUID, UUID, TEXT) TO authenticated;

-- ============================================================
-- 2. Objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS objectives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,                       -- free text: "Bonus", "Training", "Traffic" ...
  points        INTEGER CHECK (points IS NULL OR points >= 0),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'done', 'dropped')),
  claimed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at    TIMESTAMPTZ,
  completed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at  TIMESTAMPTZ,
  evidence      TEXT,                       -- what was done / where the proof is
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS objectives_deployment_idx ON objectives (deployment_id, status, sort_order);
DROP TRIGGER IF EXISTS objectives_updated_at ON objectives;
CREATE TRIGGER objectives_updated_at BEFORE UPDATE ON objectives FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "objectives_select" ON objectives;
CREATE POLICY "objectives_select" ON objectives FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "objectives_write" ON objectives;
CREATE POLICY "objectives_write" ON objectives FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- Operators claim, release and complete objectives through this; planners may set anything.
CREATE OR REPLACE FUNCTION set_objective_status(p_objective_id UUID, p_status TEXT, p_evidence TEXT DEFAULT NULL)
RETURNS objectives
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller UUID := auth.uid();
  o objectives%ROWTYPE;
  planner BOOLEAN;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT has_role('admin', 'planner', 'operator') THEN
    RAISE EXCEPTION 'Your account cannot take objectives yet' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM objectives WHERE id = p_objective_id;
  IF NOT FOUND OR NOT deployment_visible(o.deployment_id) THEN
    RAISE EXCEPTION 'Objective not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_status NOT IN ('open', 'claimed', 'done', 'dropped') THEN
    RAISE EXCEPTION 'Unknown status %', p_status USING ERRCODE = '22023';
  END IF;
  planner := has_role('admin', 'planner');

  IF NOT planner THEN
    -- open -> claimed (mine); claimed(mine) -> open | done; done(mine) -> claimed
    IF NOT (
      (o.status = 'open' AND p_status = 'claimed')
      OR (o.status = 'claimed' AND o.claimed_by = caller AND p_status IN ('open', 'done'))
      OR (o.status = 'done' AND (o.completed_by = caller OR o.claimed_by = caller) AND p_status = 'claimed')
    ) THEN
      RAISE EXCEPTION 'Status change % -> % is not allowed' , o.status, p_status USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE objectives
     SET status = p_status,
         claimed_by = CASE WHEN p_status = 'claimed' THEN COALESCE(CASE WHEN o.status = 'open' THEN caller ELSE claimed_by END, caller)
                           WHEN p_status = 'open' THEN NULL ELSE claimed_by END,
         claimed_at = CASE WHEN p_status = 'claimed' AND o.status = 'open' THEN now() WHEN p_status = 'open' THEN NULL ELSE claimed_at END,
         completed_by = CASE WHEN p_status = 'done' THEN caller ELSE NULL END,
         completed_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END,
         evidence = CASE WHEN p_evidence IS NOT NULL THEN NULLIF(btrim(p_evidence), '') ELSE evidence END
   WHERE id = o.id
   RETURNING * INTO o;
  RETURN o;
END;
$$;
REVOKE ALL ON FUNCTION set_objective_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_objective_status(UUID, TEXT, TEXT) TO authenticated;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE objectives; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE assets; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
