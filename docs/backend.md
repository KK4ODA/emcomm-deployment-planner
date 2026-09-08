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
| `positions` | A job to staff: `deployment_id`, optional `site_id`, `name`, `tactical_callsign`, `position_type`, `net`, `headcount`, `requirements` JSONB (`[{kind,value,mandatory,notes}]`), `briefing_notes`, `supervisor_position_id` (009), `open_signup` self sign-up switch (015), `packet_snapshot` + `packet_snapshot_version` as of the last publication (013) |
| `shifts` | A time window on a position: `starts_at`, `ends_at`, optional `muster_at`, optional `headcount` override, optional `operational_period_id` (009) |
| `assignments` | One operator on one shift: `status` ladder `offered → accepted/declined → checked_in → on_position → released` (+ `no_show`, `cancelled`), transition timestamps, `decline_reason`, `packet_version_seen`, `notes`. Unique per (shift, user). Trigger `assignments_before_write` lets operators move only their own row along the ladder; planners may do anything; timestamps are stamped server-side (009) |
| `channels` | The ARES group's channel library (ICS-217A): name, kind (repeater/simplex/digital/talkgroup/phone), RX/TX frequency and tones, bandwidth, mode A/D/M, digital mode, gateway call-SSID, tactical address, owner, phone number, timeout, `active` (010) |
| `comms_plans` | One communications plan per deployment (optionally per operational period): special instructions, prepared by (010) |
| `comms_plan_channels` | Snapshot of a library channel in a plan plus its use: zone/channel number, function, assignment, net, `condition_level` 1–3, `path_role` primary/alternate/contingency/emergency (010) |
| `ics205_forms` | Legacy per-site radio plan; unused since 010 (no rows) |
| `activity_log` | Append-only record: check-ins, status changes, notes, incidents; `intent_id` unique for idempotent replay; source for ICS-214 (011) |
| `hour_entries` | Participation hours per operator: derived from released assignments (`estimated` when a check-in or check-out time is missing) or manual; `activity_type` emergency/public_service/training/net/admin/maintenance (011) |

| `feedback` | Post-event feedback, one per user per deployment, or anonymous (`user_id` NULL): rating 1–5, went well, problems, comms worked yes/partly/no, comms and equipment notes, one change (012) |
| `lessons` | Lessons learned per group and deployment, optional position/site, category staffing/comms/equipment/logistics/safety/process, finding, recommendation, status open/carried_forward/addressed/wont_fix, `carried_from_lesson_id` (012) |
| `map_layers` | Imported course routes, boundaries and waypoints per deployment: `name`, `kind` route/area/points/mixed, `color`, `geojson` (FeatureCollection, < 4 MB), `source_file`, `sort_order` (016). Planners write, group reads |
| `assets` | Group equipment: `ares_group_id`, name, kind, serial, `owner_user_id` (NULL = group), `home_location`, notes, `status` storage/with_person/on_site/retired, `custodian_user_id`, `deployment_id`, `site_id`, `status_changed_at` (018). Planners write; custody changes only through `move_asset` |
| `asset_custody` | Append-only custody moves: action, from/to user, deployment, site, note, recorded_by, at (018) |
| `objectives` | Per-deployment objectives: title, description, category, points, `status` open/claimed/done/dropped, claimed_by/at, completed_by/at, evidence, sort_order (018). Planners write; operators move status through `set_objective_status` |
| `app_config` | Server-side settings the service role alone can read: `hook_secret`, `deliver_url`, generated `vapid_keys` (019). No policies; RLS on |
| `push_subscriptions` | Web push subscriptions per device: endpoint (unique), keys, user agent, failures; users manage their own rows (019) |
| `coverage_log` | Radio path attempts per group: from / to (site or coordinates or label), channel, frequency, mode, power, antenna, result direct/relay/fail, reporter, time (020). Members insert their own rows; planners edit any |
| `safety_checklists` | One per deployment: template name, items `[{id,text,state,note}]`, notes, signature; trigger stamps `signed_by`/`signed_at` and refuses any change once signed (020). Planners write; group reads |
| `naming_schemes` | Saved position patterns per group: position pattern, tactical pattern, type, net, requirements (020). Planners write; group reads |
| `aprs_bridges` | Per-group bridge tokens (SHA-256 only), last report, station call, revoked_at (021). Planners manage |
| `aprs_positions` | Heard stations: callsign, base call, fix, symbol, comment, via, heard_at; 14-day history; `aprs_positions_latest` view gives the newest per callsign (021). Group reads; written by `aprs-ingest` |
| `aprs_actions` | Audit of APRS commands received: sender, action, matched user and assignment, result, reply (021) |
| `aprs_outbox` | APRS messages for the bridge to send: recipient, 67-char text, status pending/sent/failed/expired, attempts (021) |
| `open_shift_notices` | Who was told about which open shift and when; `notify_open_shift` uses it to skip repeats within 24 h (017) |
| `notifications` | Per-user notifications produced by triggers |

RPC `set_assignment_status(assignment, status, at, note, intent_id)`
(011): the only write path the offline outbox uses. Operators may only move
their own assignment forward; planners and admins may set any status; the
call is idempotent per `intent_id`.

RPC `publish_plan(deployment, note, changes, notify_all)` (013): bumps
`plan_version`, stores each position's packet snapshot
(`positions.packet_snapshot`), notifies only operators on positions whose
`changes` array is non-empty (message = note + their position's changes),
and marks unaffected assignments as having seen the new version so no
change banner appears for them. `notify_all` sends to everyone assigned.
The broadcast trigger `deployments_notify_plan` stands down while the RPC
runs (GUC `emcomm.publishing`) and still covers direct updates.

RPC `volunteer_for_shift(shift, note)` (015): the signed-in operator (role
admin/planner/operator) takes an open shift on a position with `open_signup`
in a planning/active deployment they can see; capacity is checked under a
row lock; a previous declined row is replaced; the deployment creator is
notified ("KK4ODA took AID MILE 12"). Idempotent when already assigned.

The Supabase security advisor flags every `SECURITY DEFINER` function that
`authenticated` may execute. This is intentional for all of them: the
helper predicates must be executable by `authenticated` because RLS
policies evaluate them as the querying role, and the three RPCs
(`set_assignment_status`, `publish_plan`, `volunteer_for_shift`) are the
client's write paths and check role and visibility themselves. Trigger
functions have EXECUTE revoked. The remaining advisor item, leaked-password
protection, is an Auth dashboard switch.

RPC `notify_open_shift(shift, user_ids)` (017): planner-only; inserts an
`open_shift` notification for each listed user who is an active member of
the deployment's group, not already on the shift, and not notified for it
in the last 24 hours. Returns `{ notified, skipped_recent }`.

RPC `move_asset(asset, action, to_user, deployment, site, note)` (018): any
active member of the asset's group records a move (checked_out, on_site,
returned, transferred; planners also retired / restored); appends to
`asset_custody` and updates status, custodian, deployment and site.

RPC `set_objective_status(objective, status, evidence)` (018): operators
may go open -> claimed (theirs), claimed -> open | done, done -> claimed;
planners may set anything.

Trigger `notifications_deliver` (019): after every insert of a deliverable
type (`assignment_offered/accepted/declined`, `plan_published`, `open_shift`,
`info`), `net.http_post` sends the row to `deliver_url` with the
`x-emcomm-hook` secret; failures never block the insert.

Function `apply_aprs_status(user, status, at, note)` (021, service role only):
finds the operator's live assignment, applies checked_in / on_position /
released along the same ladder as the app, logs it ("via APRS") with an
idempotency key, and returns a short reply for the radio.

Helper predicates `is_admin()`, `has_role(...)`, `deployment_visible()` and
`location_visible()` return `false`, never NULL, for a caller without a
`users` row (014), so PL/pgSQL guards of the form `IF NOT ... THEN RAISE`
are safe as well as RLS.

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
| `deliver-notification` | database trigger (POST), Profile > Notifications (GET) | `verify_jwt` off; POST is authenticated by the `x-emcomm-hook` secret from `app_config`. Delivers a notification to the recipient's enabled channels: web push (VAPID keys generated on first use and kept in `app_config`; dead subscriptions removed on 404/410), email via Resend when `RESEND_API_KEY` + `EMAIL_FROM` are set, SMS via Twilio when `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` are set; `APP_URL` for links. GET returns which channels are configured and the push public key. Push (iPhone via Safari home-screen install) and email (Resend, verified domain) confirmed end to end on 2026-09-08 |
| `aprs-ingest` | the Graywolf bridge and Graywolf Actions | `verify_jwt` off; every route requires a bridge token (`Authorization: Bearer` or `?token=`), matched by SHA-256 against `aprs_bridges`. `POST /stations` upserts heard stations; `POST /action` is the Graywolf Action webhook (form fields `action`, `sender-callsign`, `arg.*`), matches the sender by APRS call then base call, requires group membership, applies the status and replies in plain text; `GET /outbox` + `POST /outbox/ack` drive outbound APRS messages; `GET /objects?deployment=active&format=json|csv` returns sites as Pinpoint-shaped objects; `GET /ping` checks the token |
| `invite-user` (v3: optional `call_sign`, `full_name`, `phone`, `license_class` fill empty profile columns; an existing member is added to the groups instead of failing) | Members › Invite | Admin or planner. `auth.admin.inviteUserByEmail`, sets the initial role (planners: pending/viewer/operator only) and inserts active `memberships` (planners: only their own groups) |
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
