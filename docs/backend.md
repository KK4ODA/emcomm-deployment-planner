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
| `WHAT3WORDS_API_KEY` | `get-what3words`, `export-deployment` (optional) |

## Schema

Migrations live in `supabase/migrations/` and are applied in order with the
SQL editor or the Supabase CLI (`supabase db push`).

| Table | Purpose |
|-------|---------|
| `users` | Profile per auth user: name, call sign (unique, format-checked), phone, APRS call sign, `app_role`, `ares_group_ids[]` (server-maintained mirror of active memberships; read-only), `profile_image_url` |
| `ares_groups` | Groups (organisations) that scope deployments; `admin_user_ids[]` |
| `memberships` | `(ares_group_id, user_id, status pending/active)`; members request, admins approve; the source of truth for group access (008) |
| `deployments` | Name, status (`planning/active/completed/archived`), dates, region, `ares_group_id`, `created_by` |
| `deployment_locations` | Sites within a deployment; address/coordinates, contact, `assigned_call_signs[]`, `sort_order` |
| `categories` | Equipment categories per deployment (colour, `sort_order`) |
| `deployment_items` | Equipment per site/category; `assigned_to[]` call signs, quantity, priority |
| `tasks` | Setup tasks per site; materialised from `events` |
| `events` | Append-only event log (ULID ids) for offline sync; trigger materialises `task` events |
| `event_acks` | Reserved for multi-peer sync |
| `deployment_templates` | Saved structure (JSONB) with counts; `ares_group_id` scopes visibility |
| `ics205_forms` | One radio plan per site; `radio_channels` JSONB |
| `notifications` | Per-user notifications produced by triggers |

Triggers: `handle_new_user` creates the `users` row on sign-up;
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
| `export-ics205` | (legacy) | Returns form JSON; the app now renders the PDF locally |
| `get-what3words` | (disabled in UI) | what3words lookup; needs `WHAT3WORDS_API_KEY` |

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
