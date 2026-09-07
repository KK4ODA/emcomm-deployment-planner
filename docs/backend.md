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
| `users` | Profile per auth user: name, call sign, phone, APRS call sign, `app_role`, `ares_group_ids[]`, `profile_image_url` |
| `ares_groups` | Groups that scope deployments; `admin_user_ids[]` |
| `deployments` | Name, status (`planning/active/completed/archived`), dates, region, `ares_group_id`, `created_by` |
| `deployment_locations` | Sites within a deployment; address/coordinates, contact, `assigned_call_signs[]`, `sort_order` |
| `categories` | Equipment categories per deployment (colour, `sort_order`) |
| `deployment_items` | Equipment per site/category; `assigned_to[]` call signs, quantity, priority |
| `tasks` | Setup tasks per site; materialised from `events` |
| `events` | Append-only event log (ULID ids) for offline sync; trigger materialises `task` events |
| `event_acks` | Reserved for multi-peer sync |
| `deployment_templates` | Saved structure (JSONB) with counts |
| `ics205_forms` | One radio plan per site; `radio_channels` JSONB |
| `notifications` | Per-user notifications produced by triggers |

Triggers: `handle_new_user` creates the `users` row on sign-up;
`materialize_task_event` applies task events with a forward-only status
machine (`006_task_status_state_machine.sql`); notification triggers fire on
task assignment/completion and essential-item shortages (`005`).

Storage: bucket `avatars` (public read, owner-only write under `<user id>/`).

## Row-Level Security

All tables have RLS enabled (`002_rls_policies.sql`, `007_fix_notifications_rls.sql`).
Summary: any authenticated user can read most reference tables; deployments are
readable by admins or ARES-group members; writes require `operator` or
`admin`; deletes and user management require `admin`; notifications are
scoped to the recipient's email from the JWT.

## Edge Functions

Sources in `supabase/functions/<slug>/index.ts`; deploy with
`supabase functions deploy <slug>` (or the Supabase MCP/dashboard). All verify
the caller's JWT and use the service role only after checking the caller.

| Slug | Called from | What it does |
|------|-------------|--------------|
| `invite-user` | Members › Invite | `auth.admin.inviteUserByEmail`, sets role and ARES groups |
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
