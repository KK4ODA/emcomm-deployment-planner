-- 012: After-action feedback and lessons (Phase 4)
--
-- feedback  short per-operator post-event form (optionally anonymous)
-- lessons   findings that outlive the deployment; duplicated deployments
--           receive open lessons as "carried_forward" so they reappear
--           where they matter next year.

CREATE TABLE IF NOT EXISTS feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id    UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  assignment_id    UUID REFERENCES assignments(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL when anonymous
  anonymous        BOOLEAN NOT NULL DEFAULT false,
  rating           INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  went_well        TEXT,
  problems         TEXT,
  comms_worked     TEXT CHECK (comms_worked IS NULL OR comms_worked IN ('yes', 'partly', 'no')),
  comms_notes      TEXT,
  equipment_notes  TEXT,
  one_change       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_deployment_idx ON feedback (deployment_id, created_at);
-- one named response per person per deployment
CREATE UNIQUE INDEX IF NOT EXISTS feedback_one_per_user ON feedback (deployment_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lessons (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id               TEXT,
  deployment_id               UUID REFERENCES deployments(id) ON DELETE SET NULL,
  position_id                 UUID REFERENCES positions(id) ON DELETE SET NULL,
  site_id                     UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  category                    TEXT NOT NULL DEFAULT 'process'
    CHECK (category IN ('staffing', 'comms', 'equipment', 'logistics', 'safety', 'process')),
  finding                     TEXT NOT NULL,
  recommendation              TEXT,
  status                      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'carried_forward', 'addressed', 'wont_fix')),
  carried_from_lesson_id      UUID REFERENCES lessons(id) ON DELETE SET NULL,
  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lessons_deployment_idx ON lessons (deployment_id, status);
CREATE INDEX IF NOT EXISTS lessons_group_idx ON lessons (ares_group_id, status);
DROP TRIGGER IF EXISTS lessons_updated_at ON lessons;
CREATE TRIGGER lessons_updated_at BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons  ENABLE ROW LEVEL SECURITY;

-- Feedback: anyone in the deployment may submit once; planners read all;
-- authors read their own named response.
DROP POLICY IF EXISTS "feedback_select" ON feedback;
CREATE POLICY "feedback_select" ON feedback FOR SELECT TO authenticated
  USING (deployment_visible(deployment_id) AND (has_role('admin', 'planner') OR user_id = auth.uid()));
DROP POLICY IF EXISTS "feedback_insert" ON feedback;
CREATE POLICY "feedback_insert" ON feedback FOR INSERT TO authenticated
  WITH CHECK (deployment_visible(deployment_id) AND ((anonymous AND user_id IS NULL) OR (NOT anonymous AND user_id = auth.uid())));
DROP POLICY IF EXISTS "feedback_update" ON feedback;
CREATE POLICY "feedback_update" ON feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "feedback_delete" ON feedback;
CREATE POLICY "feedback_delete" ON feedback FOR DELETE TO authenticated
  USING (is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "lessons_select" ON lessons;
CREATE POLICY "lessons_select" ON lessons FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "lessons_write" ON lessons;
CREATE POLICY "lessons_write" ON lessons FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))));
