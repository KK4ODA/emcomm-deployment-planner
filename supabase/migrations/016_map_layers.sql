-- 016_map_layers.sql
-- Course routes, boundaries and waypoints imported from KML/GPX/GeoJSON,
-- stored as GeoJSON per deployment and drawn on the site map.
--
-- Roadmap: Phase 4 "map layers, GPX/KML import".

CREATE TABLE IF NOT EXISTS map_layers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'route' CHECK (kind IN ('route', 'area', 'points', 'mixed')),
  color         TEXT,
  geojson       JSONB NOT NULL,
  source_file   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT map_layers_geojson_size CHECK (pg_column_size(geojson) < 4 * 1024 * 1024)
);
CREATE INDEX IF NOT EXISTS map_layers_deployment_idx ON map_layers (deployment_id, sort_order);
DROP TRIGGER IF EXISTS map_layers_updated_at ON map_layers;
CREATE TRIGGER map_layers_updated_at BEFORE UPDATE ON map_layers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE map_layers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "map_layers_select" ON map_layers;
CREATE POLICY "map_layers_select" ON map_layers FOR SELECT TO authenticated
  USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "map_layers_write" ON map_layers;
CREATE POLICY "map_layers_write" ON map_layers FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));
