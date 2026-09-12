-- 022: packet extras
--   deployments.map_url             a shared map link (Google My Maps etc.) shown on every packet
--   deployments.roster_drive_*      the staffing roster posted to Google Drive as a Sheet
--   aprs_station_calls              read-only view so operators can see which call to send @@# commands to

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS map_url text,
  ADD COLUMN IF NOT EXISTS roster_drive_file_id text,
  ADD COLUMN IF NOT EXISTS roster_drive_url text,
  ADD COLUMN IF NOT EXISTS roster_drive_updated_at timestamptz;

COMMENT ON COLUMN deployments.map_url IS 'Link to the event map kept elsewhere (Google My Maps, CalTopo); printed on packets';
COMMENT ON COLUMN deployments.roster_drive_url IS 'Google Sheet with the staffing roster, posted from the app; linked on packets';

-- Members may not read aprs_bridges (tokens hashes, errors). This view exposes
-- only the station call signs of their own groups' live bridges. It runs as
-- its owner, so the membership check is in the WHERE clause.
CREATE OR REPLACE VIEW aprs_station_calls AS
  SELECT b.ares_group_id, b.name, b.station_call, b.last_seen_at
  FROM aprs_bridges b
  WHERE b.revoked_at IS NULL
    AND b.station_call IS NOT NULL
    AND (is_admin() OR b.ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));

GRANT SELECT ON aprs_station_calls TO authenticated;
