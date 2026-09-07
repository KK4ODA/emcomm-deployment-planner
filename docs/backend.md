# Backend (Supabase)

The application uses one Supabase project. Nothing else runs server-side.

## Environment variables

Client (Vite, baked into the build; safe to expose because RLS protects data):

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `.env.local`, GitHub secret | Project URL, e.g. `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, GitHub secret | Anon / publishable key |

Copy `.env.example` to `.env.local` for local work. `.env*` files are
git-ignored; never commit them.

Edge Functions (set in the Supabase dashboard under Functions › Secrets):

| Secret | Used by |
|--------|---------|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | provided automatically |
| `WHAT3WORDS_API_KEY` | `export-deployment` (optional) |

## Schema

Migrations live in `supabase/migrations/` and are applied in order with the
SQL editor or the Supabase CLI (`supabase db push`).

| Table | Purpose |
|-------|---------|
| `users` | Profile per auth user: name, call sign (unique, format-checked), phone, APRS call sign, `app_role`, `ares_group_ids[]` (server-maintained mirror of active memberships; read-only), `profile_image_url`; capability profile `license_class`, `capabilities[]`, `station_types[]`, `power_hours`, `locality`, `equipment_notes` (vocabularies in `src/lib/capabilities.js`) |
| `ares_groups` | Groups (organisations) that scope deployments; `admin_user_ids[]` |
| `memberships` | `(ares_group_id, user_id, status pending/active)`; members request, admins approve; the source of truth for group access (008) |
| `deployments` | Name, status (`planning/active/completed/archived`), `profile` (public_service/activation/exercise/field_day/net/training), `starts_at`/`ends_at` (timestamptz; legacy `start_date`/`end_date` kept in sync by the client), region, `ares_group_id`, `created_by`, served agency / requesting official / tasking reference / `authorized_at`, `plan_version` + `plan_published_at` + `plan_change_note` (packet versioning) |
| `deployment_locations` | Sites within a deployment; address/coordinates (`lat`/`lon` derived from the address when it parses), `site_type`, contact, `assigned_call_signs[]` (legacy roster; positions supersede it), `parking_notes`, `arrival_notes`, `access_notes`, `sort_order` |
| `categories` | Equipment categories per deployment (colour, `sort_order`) |
| `deployment_items` | Equipment per site/category; `assigned_to[]` call signs, quantity, priority |
| `tasks` | Setup tasks per site; materialised from `events` |
| `events` | Append-only event log (ULID ids) for offline sync; trigger materialises `task` events |
| `event_acks` | Reserved for multi-peer sync |
| `deployment_templates` | Saved structure (JSONB) with counts; `ares_group_id` scopes visibility |
| `operational_periods` | Time windows of a deployment (`sequence`, `label`, `starts_at`, `ends_at`) that shifts and the comms plan can be scoped to (009) |
| `positions` | A job to staff: `deployment_id`, optional `site_id`, `name`, `tactical_callsign`, `position_type`, `net`, `headcount`, `requirements` JSONB (`[{kind,value,mandatory,notes}]`), `briefing_notes`, `supervisor_position_id` (009) |
| `shifts` | A time window on a position: `starts_at`, `ends_at`, optional `muster_at`, optional `headcount` override, optional `operational_period_id` (009) |
| `assignments` | One operator on one shift: `status` ladder `offered → accepted/declined → checked_in → on_position → released` (+ `no_show`, `cancelled`), transition timestamps, `decline_reason`, `packet_version_seen`, `notes`. Unique per (shift, user). Trigger `assignments_before_write` lets operators move only their own row along the ladder; planners may do anything; timestamps are stamped server-side (009) |
| `channels` | The ARES group's channel library (ICS-217A): name, kind (repeater/simplex/digital/talkgroup/phone), RX/TX frequency and tones, bandwidth, mode A/D/M, digital mode, gateway call-SSID, tactical address, owner, phone number, timeout, `active` (010) |
| `comms_plans` | One communications plan per deployment (optionally per operational period): special instructions, prepared by (010) |
| `comms_plan_channels` | Snapshot of a library channel in a plan plus its use: zone/channel number, function, assignment, net, `condition_level` 1–3, `path_role` primary/alternate/contingency/emergency (010) |
| `ics205_forms` | Legacy per-site radio plan; unused since 010 (no rows) |
| `notifications` | Per-user notifications produced by triggers |

Triggers: `handle_new_user` creates the `users` row on sign-up;
`assignments_notify` writes a notification to the operator on offer and to
the deployment creator on accept/decline; `deployments_notify_plan` notifies
everyone assigned when `plan_version` changes;
`materialize_task_event` applies task events with a forward-only status
machine (`006_task_status_state_machine.sql`); notification triggers fire on
task assignment/completion and essential-item shortages (`005`).

Storage: bucket `avatars` (public read, owner-only write under `<user id>/`).

## Roles

`users.app_role` is global (one role per person across groups):

| Role | Can |
|------|-----|
| `admin` | Everything: members, roles, groups, approvals, deletes |
| `planner` | Create and edit deployments, sites, categories, templates, positions, assignments, comms plans; invite (pending/viewer/operator) |
| `operator` | Own profile and assignments; create/edit items and tasks; check in/out |
| `viewer` | Read-only within their groups |
| `pending` | Nothing beyond their own profile until approved |

`memberships.role` is reserved for per-group roles and unused.

## Row-Level Security

All tables have RLS enabled. Since migration `008_security_and_roles.sql`:

- **Read isolation**: every deployment-scoped table (`deployment_locations`,
  `categories`, `deployment_items`, `tasks`, `ics205_forms`, `events`) is
  visible only when `deployment_visible(deployment_id)` holds: the caller is
  an admin or has an *active* membership in the deployment's group.
  `deployment_templates` is scoped by `ares_group_id`. `users` rows are
  visible to admins, to the user themself, and to people who share an active
  group with them (`shares_group_with`). `ares_groups` names are readable by
  all signed-in users so members can request to join.
- **Writes**: planning tables require `admin` or `planner`; items and tasks
  also allow `operator`; deletes of deployments, groups and users are
  admin-only. All write policies also require deployment visibility.
- **Event log**: inserts require `actor_user_id = auth.uid()`, a role in
  (admin, planner, operator) and a visible, non-null `deployment_id`.
- **Memberships**: a user may insert only their own `pending` row and delete
  their own pending row; admins approve (update) and remove.
- **Column protection** (`users_protect_columns` trigger): `ares_group_ids`
  is only written by the membership mirror; `app_role` can only be changed by
  an admin (closes self-escalation through the own-row update policy).
- Helper functions (`is_admin`, `has_role`, `deployment_visible`,
  `location_visible`, `shares_group_with`, `get_user_role`,
  `get_user_ares_groups`) are `SECURITY DEFINER STABLE` with a fixed
  `search_path`, executable by `authenticated` only. Trigger functions are
  not executable by clients.
- Notifications are scoped to the recipient's email from the JWT; only
  admins/planners may insert them directly (triggers bypass RLS).

Verification used after 008: with `SET LOCAL ROLE authenticated` and a JWT
`sub` that belongs to no group, `users`, `deployments`, `deployment_locations`,
`events` and `memberships` all return zero rows.

## Edge Functions

Sources in `supabase/functions/<slug>/index.ts`; deploy with
`supabase functions deploy <slug>` (or the Supabase MCP/dashboard). All verify
the caller's JWT and use the service role only after checking the caller.

| Slug | Called from | What it does |
|------|-------------|--------------|
| `invite-user` | Members › Invite | Admin or planner. `auth.admin.inviteUserByEmail`, sets the initial role (planners: pending/viewer/operator only) and inserts active `memberships` (planners: only their own groups) |
| `create-or-update-user-profile` | Profile › Add member, Members › Edit | Admin-only upsert of a member profile by email; invites if new |
| `cleanup-deleted-user` | Members › Remove | Admin-only; clears the call sign from items, sites and tasks. Body: `{ "callSign": "W1ABC" }` |
| `export-deployment` | Deployments › Export | Plain-text operational summary (+ go-kit list) |

Removed from the repository in v2.0: `export-ics205` and `get-what3words`
(unreachable from the client). If they are still deployed in the Supabase
project, delete them from Edge Functions in the dashboard.

## Realtime

Publication `supabase_realtime` includes `categories`, `deployment_items`,
`deployment_locations`, `tasks`, `notifications`, `events`.

## Auth configuration checklist

In the Supabase dashboard:

- Authentication › URL configuration: add the web origin(s) and
  `<origin>/reset-password` to the redirect allow-list. The desktop app uses
  the same reset flow through the web origin.
- Email templates: invitation and recovery links must point to the web app.
- Disable public sign-ups if you only want invited members (the sign-in page
  still offers "Create account" when sign-ups are allowed).
