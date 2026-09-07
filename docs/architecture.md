# Architecture

EmComm Planner is a single React application delivered three ways from one
codebase: as a website, as an installable PWA, and as a Windows desktop app
(Tauri shell around the same build). The backend is Supabase (Postgres, Auth,
Storage, Edge Functions). There is no other server.

```
┌────────────────────────────── React app (Vite) ──────────────────────────────┐
│ pages/            thin route components                                      │
│ features/*        one folder per domain area (dashboard, items, sites, ...)  │
│ components/       ui/ (Radix primitives)  common/ (building blocks)  shell/  │
│ contexts/         AuthContext · DeploymentContext · OfflineContext            │
│ hooks/            useEntities (React Query hooks + mutations)                 │
│ lib/              pure domain logic, permissions, constants, offline storage │
│ api/              supabaseClient · db (repositories) · auth · functions ·     │
│                   taskEvents + syncEngine (event log)                         │
└──────────────┬──────────────────────────────┬────────────────────────────────┘
               │ HTTPS / WebSocket             │ IndexedDB (events, tasks, outbox)
     ┌─────────▼──────────┐          ┌─────────▼───────────┐
     │ Supabase project   │          │ Browser / WebView2  │
     │ Postgres + RLS     │          │ localStorage (cached│
     │ Auth · Storage     │          │ identity, prefs)    │
     │ Edge Functions     │          │ Service worker cache│
     └────────────────────┘          └─────────────────────┘
```

## Source layout

| Path | Purpose |
|------|---------|
| `src/app/` | `App.jsx` (providers + router) and `routes.js` (all paths, legacy redirects) |
| `src/pages/` | One component per route; composes feature components |
| `src/features/<area>/` | Forms, cards, dialogs and hooks that belong to one area (`dashboard`, `deployments`, `items`, `sites`, `tasks`, `ics205`, `members`, `assignments`, `profile`, `about`, `desktop`, `pwa`, `auth`, `notifications`, `templates`, `aresGroups`) |
| `src/components/ui/` | shadcn-style Radix wrappers, typed with JSDoc |
| `src/components/common/` | PageHeader, StatCard, Section, EmptyState, ErrorState, QueryState, ConfirmDialog, CallSign, Badges, FormField, AresGroupPicker, DeploymentGate |
| `src/components/shell/` | Sidebar, TopBar, DeploymentSwitcher, ConnectivityBadge, OfflineBanner, UserMenu, MobileNav |
| `src/contexts/` | Deployment selection and offline tier providers |
| `src/lib/` | Pure functions (tested): permissions, callsign, coordinates, assignments, tasks, deployments, templates, time, download; `offline/storage.js` IndexedDB wrapper |
| `src/api/` | Everything that talks to Supabase |
| `src/test/` | Vitest setup and the Supabase client mock |
| `src-tauri/` | Desktop shell (Rust) and installer configuration |
| `supabase/` | SQL migrations and Edge Function sources |

## Data flow

- **Reads** go through React Query hooks in `src/hooks/useEntities.js`. Each
  hook wraps a repository from `src/api/db.js` (`db.deployments.list()`, ...).
  Query keys live in `src/lib/queryKeys.js`.
- **Writes** use `useEntityMutations()` for plain tables (create/update/remove
  with toast on error and cache invalidation) or feature-specific mutations.
- **Realtime**: `useRealtimeInvalidation(table, key)` subscribes to Supabase
  Realtime and invalidates the matching query.
- **Tasks are different.** They are written as events (`src/api/taskEvents.js`)
  into IndexedDB first, then posted to the `events` table when online or
  queued in an outbox. A Postgres trigger materialises events into the `tasks`
  table with a forward-only status state machine; the client mirrors that
  logic so optimistic updates match. `src/api/syncEngine.js` drains the outbox,
  pulls new events since a high-water mark, subscribes to Realtime and tracks
  connectivity (`ONLINE`/`OFFLINE`). Background: `docs/offline-architecture.md`.

## State

| State | Where | Why |
|-------|-------|-----|
| Signed-in profile | `AuthContext` (+ cached copy in localStorage for 7 days) | App opens offline |
| Selected deployment | `DeploymentContext` (+ localStorage) | Every scoped page reads it; no reloads |
| Connectivity, outbox size | `OfflineContext` | Badge, banner, task dispatch |
| Server data | React Query cache | Shared between pages, invalidated by mutations/Realtime |
| Tasks | IndexedDB `entities.tasks` | Offline reads/writes |
| UI preferences | localStorage (`sidebar`, `sites view`, theme, show archived) | Per device |
| Go-kit ticks | localStorage `emcomm_gokit:<deployment>:<call sign>` | Personal packing state, not shared |

## Staffing model (positions, shifts, assignments)

```
Deployment ─┬─ OperationalPeriod[]      time windows (ICS scope)
            ├─ Site[]                   places, with parking/arrival/access notes
            └─ Position[]               a job: name, TAC call, type, headcount, requirements[]
                 └─ Shift[]             when: starts/ends, muster, optional period
                      └─ Assignment[]   who: operator + status ladder + timestamps
```

- **Requirements** are JSONB rows `{ kind, value, mandatory }` with kinds
  `capability`, `station_type`, `power_hours`, `license_class`, `other`
  (`src/lib/capabilities.js` holds the vocabularies and labels).
- **Matching** is pure and client-side (`src/lib/staffing.js`):
  `matchRequirements(position, shift, user)` distinguishes *unmet* (profile
  says no) from *unknown* (profile empty), `shiftCoverage()` yields
  covered/pending/open/at-risk per shift, `coverageSummary()` the headline
  "X of Y covered", and `rankCandidates()` orders operators for the assign
  dialog without ever excluding anyone.
- **Status ladder** on `assignments`: `offered → accepted | declined`,
  `accepted → checked_in → on_position → released`; `no_show`, `cancelled`
  are planner-set. The database trigger enforces the operator-side rules
  and stamps timestamps; planners may set any status.
- **Screens**: Staffing page (`/staffing`: coverage stats, filters, position
  cards with shift chips, position form with requirements and shifts, bulk
  create "AID MILE {n}", assign dialog with ranked candidates, operational
  periods), Profile › "What I can do" (capability chips), My Assignments ›
  "My positions" (Accept / Decline with reason, withdraw), My Assignments ›
  "Open shifts" (the sign-up sheet).
- **Self sign-up**: `openShifts()` lists shifts with open headcount on
  positions with `open_signup` (default on), not ended and not already the
  operator's, each with its requirement match and overlaps; the board
  disables shifts with unmet mandatory requirements or an overlap and says
  why. Taking one calls the `volunteer_for_shift` RPC, which re-checks
  capacity under a row lock, inserts an `accepted` assignment created by the
  operator, and notifies the deployment creator. Withdrawing is the normal
  accepted → declined move.
- **Legacy**: `deployment_locations.assigned_call_signs` remains for the
  equipment/task views; migration 009 created one position per site that had
  a roster so nothing was lost. New staffing goes through positions.

## Communications plan and the operator packet

```
ARES group ── channels[]  (library, ICS-217A shape: repeaters, simplex, gateways, phones)
Deployment ── comms_plans[] (per deployment, optionally per operational period)
                └─ comms_plan_channels[]  snapshot of a library row + function,
                                          assignment, net, condition 1/2/3, PACE role
```

- `src/lib/comms.js`: frequency normalisation (4 decimals), band names,
  standard repeater offsets, one-line channel summaries
  ("146.8200− PL 146.2"), condition/PACE vocabularies, plan completeness
  warnings, CHIRP CSV export.
- `src/features/comms/ics205Pdf.js` renders the FEMA ICS-205 from a plan:
  Condition 1 as block 4, Conditions 2 and 3 as further sections; cells
  wrap. The per-site `ics205_forms` editor was removed (table kept, unused).
- Plan rows are **snapshots**: editing the library flags stale rows on the
  plan page ("Update from library") instead of changing a published plan.
- **Publishing**: "Publish plan" (Staffing and Comms pages) diffs every
  position's packet against the snapshot stored at the last publication
  (`src/lib/planDiff.js`: `packetSnapshot`, `diffSnapshots`, `planChanges`)
  and shows the per-position changes in the dialog. The `publish_plan` RPC
  bumps `deployments.plan_version`, stores the new snapshots, notifies only
  the operators on changed positions with those changes (or everyone, when
  "Notify everyone assigned" is ticked, the default when nothing changed),
  and keeps unaffected operators current. `assignments.packet_version_seen`
  drives the packet's change banner until the operator taps "Got it".
- **Packet** (`/packet`, `/packet/:assignmentId`): `src/lib/packet.js`
  projects one assignment into the operator view (`buildPacket`), picking
  the running or next assignment by default (`pickCurrentAssignment`).
  Channels are filtered to the position's net plus net-less rows.
  `PacketMap` draws the site pin over the deployment's map layers (tiles
  come from the OpenStreetMap runtime cache once seen, so the map survives
  offline) and opens directions on tap.
  `PacketView` puts position, tactical call, report time, place and primary
  frequency above the fold, two actions at most (Directions + one primary),
  prints on one page via `@media print` rules in `index.css`. Operators
  without planning rights are sent to the packet when they open the app on
  a phone with an assignment. Everything the packet reads is a Supabase
  `GET` cached by the service worker, so it reopens offline once seen.

## Operations: check-in, NCS board, hours

- **Status intents** (`src/api/assignmentIntents.js`): Check in / On
  position / Check out write an intent `{ id, assignment_id, status, at }`
  to IndexedDB (`intents` store) first, then call the idempotent RPC
  `set_assignment_status`. Offline or on a transient error the intent stays
  queued; `syncEngine` retries in order and stops at the first network
  failure. A permanent rejection (permission, unknown status) is kept with
  `error` so the operator can see and dismiss it. `useIntents()` exposes the
  queue; `effectiveStatus()` merges it into the server row so the UI never
  regresses.
- **Server rules** (migration 011): the RPC enforces the monotonic ladder
  for operators (a late-arriving earlier status only backfills a missing
  timestamp), lets planners record on anyone's behalf, stamps the time the
  button was pressed (`p_at`), and logs once per intent to `activity_log`.
- **NCS board** (`/ncs`): `buildNcsBoard()` turns shifts live in a time
  window into rows sorted worst-first (not checked in, nobody assigned,
  arriving, expected, on station, released), with per-operator status,
  time, phone and on-behalf buttons; a log panel shows and appends
  `activity_log` notes. Works from cache when offline with an "as of" stamp.
- **Hours**: `derive_hours_for_assignment` writes one `hour_entries` row per
  released assignment (actual check-in to check-out, or the scheduled shift
  flagged *estimated*), activity type from the deployment kind. Manual
  entries (admin, planning, maintenance) are added on Profile › My hours;
  CSV export per operator. `hoursByMonth()` groups for the monthly report;
  `/hours` (planners) rolls the whole group up per operator and month with
  `hoursRollup()` in `src/lib/icsForms.js`.
- **ICS forms from the record**: `renderIcs214Pdf()` (activity log per
  deployment, unit or person) and `renderIcs205aPdf()` (communications
  list: position, tactical call, operator, phone, primary channel) in
  `src/features/comms/icsRecordPdf.js`, row-building in `src/lib/icsForms.js`.

## After action

- **Feedback** (`feedback` table, migration 012): one row per operator per
  deployment, or anonymous rows with no user id at all; the form lives on
  `/aar` and is linked from the packet after checkout. RLS lets a user
  insert only a row that is either their own or fully anonymous.
- **Review** (`aarSummary()` in `src/lib/aar.js`): operators worked, slots
  worked, person-hours, no-shows, unstaffed shifts, incidents (log entries
  that are not status changes), feedback count, average rating and the
  comms yes/partly/no vote. `aarMarkdown()` renders the draft that the
  planner copies into the group's AAR.
- **Lessons** (`lessons` table): finding, recommendation, category, optional
  position, status open / carried_forward / addressed / wont_fix.
  `lessonsToCarry()` re-points open and carried lessons at the new
  deployment (and remapped position) when a deployment is duplicated;
  `CarriedLessons` shows them on Staffing until they are marked addressed.

## Readiness checklist

`readinessChecklist()` in `src/lib/readiness.js` turns the plan into a
worklist (design doc 9.10): each check yields `{ group, state, label,
detail, to }` with state `todo` / `warn` / `ok`, grouped Plan, Staffing,
Comms, Sites, Logistics and sorted worst first. `useReadiness()` gathers the
shared caches (including the unpublished-change count from `planChanges`)
and feeds both the `/readiness` page and the dashboard card. Not a score:
every line links to the page where it is fixed.

## Roster import

`src/lib/roster.js` parses a CSV (tolerant headers, quotes, tab or
semicolon delimiters), validates each row (email, call sign format,
duplicates in the file, call signs owned by other members, licence class,
role) and classifies it new / existing / invalid. `RosterImportDialog`
previews, then calls `invite-user` once per row, sequentially, with
progress; nothing is sent before the preview is confirmed.

## Assets and objectives

- **Assets** (`/assets`, `src/lib/assets.js`): the ARES group's shared
  equipment with owner, home location and custody state. `assetActions()`
  lists what the signed-in person may do (mirrors the `move_asset` RPC);
  `outstandingAssets()` is the teardown checklist for a deployment, also
  surfaced by the readiness checklist once the deployment has ended.
- **Objectives** (`/objectives`, `src/lib/objectives.js`): per-deployment
  list with points; `objectiveActions()` mirrors the RPC ladder for
  operators and planners; `ObjectiveList` is shared with My assignments;
  `objectiveSummary()` feeds the AAR; `objectivesToCopy()` runs on
  duplicate.

## Map layers

- `src/lib/geo.js` parses KML (Placemark Point / LineString / Polygon /
  MultiGeometry / gx:Track, style colours), GPX (wpt / trk / rte) and
  GeoJSON into a FeatureCollection with the browser's DOMParser, and
  computes summaries, bounds, waypoints and route length. No dependency.
- Layers are stored per deployment in `map_layers` (GeoJSON in JSONB, under
  4 MB) and drawn by `SiteMap` as toggleable overlays under the site
  markers; the map frames sites and layers together. `MapLayersDialog`
  (Sites › Map layers, planners) imports a file, names and colours it, lists
  and removes layers, and creates sites from a layer's waypoints (skipping
  names that already exist). Duplicating a deployment copies its layers.

## Deployment lifecycle

`planning → active → completed → archived`, with "back to planning",
"reopen" and "unarchive" as reverse moves (`DEPLOYMENT_TRANSITIONS` in
`src/lib/constants.js`). Lists sort by `sortDeployments()` (active first),
the switcher hides archived deployments, and marking one completed offers to
save it as a template. `deploymentReadiness()` in `src/lib/deployments.js`
computes the per-card readiness (unassigned items, tasks done, ICS 205
coverage) and `duplicateDeployment()` copies structure, operational periods,
positions, shifts and the comms plan snapshot, optionally with assignments
(re-offered) and tasks (tasks go through the event log as new events). A new
start date shifts every timestamp by the same offset; the Deployments page
then carries open lessons over with `lessonsToCarry()`.

## Authentication and authorization

Supabase Auth (email + password, invitations, password recovery). The `users`
table extends `auth.users` with `app_role` (`admin`, `operator`, `viewer`,
`pending`) and `ares_group_ids`. Row-Level Security policies in
`supabase/migrations/002_rls_policies.sql` enforce access on the server;
`src/lib/permissions.js` mirrors the same matrix so the UI only offers allowed
actions. Deployments are visible to admins and to members of the owning ARES
group (`src/lib/deployments.js`).

## Offline behaviour

| Capability | Offline? | Mechanism |
|------------|----------|-----------|
| Open the app, navigate | Yes | Service worker precache (web/PWA); bundled assets (desktop) |
| Stay signed in | Yes, up to 7 days | Cached identity bundle |
| View deployments, sites, items, members | Last loaded copy | Service worker `NetworkFirst` cache of REST reads |
| Create / update / complete tasks | Yes | Event log + outbox, synced when back online |
| Assign items, edit sites, invite members | No | Direct Supabase writes; the error is reported |
| ICS 205 PDF export | Yes (saved forms) | Rendered client-side with jsPDF |
| Deployment text export | No | Edge Function |
| Map tiles | Previously viewed areas | `CacheFirst` tile cache |
| Notifications | No | Server-side table |

The connectivity badge in the top bar shows the current tier and how many
changes are queued; clicking it forces a sync attempt.

## Desktop shell

`src-tauri/` hosts the Vite build in a WebView2 window. It adds nothing to the
UI except the auto-updater (`src/features/desktop/DesktopUpdater.jsx`, using
`@tauri-apps/plugin-updater`) and opening external links in the system
browser. `src/lib/platform.js` detects the shell at runtime. See
`docs/release.md` for the build and update pipeline.

## About panel

`src/features/about/AboutPanel.jsx` (Profile › About, also reachable from the
account menu) reads build facts from `src/lib/appInfo.js`: version (from
`package.json` via Vite `define`), update channel, repository and release
URLs. On the desktop it triggers a manual update check through
`requestUpdateCheck()`, which the mounted `DesktopUpdater` answers so there is
a single code path for showing the update banner.

## Design system

Text size: `src/lib/textSize.js` sets the root font size (14 / 16 / 18 /
20 px) from a per-device choice in localStorage before the first paint;
every component is sized in rem so the whole app scales. The control lives
in the user menu next to the theme.

Tokens are CSS variables in `src/index.css` consumed by
`tailwind.config.js`: `background/foreground`, `card`, `primary` (navy),
`accent` (signal orange), `muted`, `border`, and four status tones `info`,
`success`, `warning`, `destructive`. Dark mode is class-based (`next-themes`).
Type: Inter for UI, JetBrains Mono for call signs and frequencies (both
self-hosted). Conventions:

- One `PageHeader` per page; actions on the right, wrap below on mobile.
- Metrics in `StatCard`; grouped content in `Section` or `Card`.
- Status via `Badge` variants (`info`, `success`, `warning`, `critical`) and the
  `*Badge` helpers in `components/common/Badges.jsx`.
- Call signs always through `CallSign` / `CallSignList`.
- Destructive actions confirm through `useConfirm()`.
- Every data page renders loading, empty and error states (`QueryState`,
  `EmptyState`, `ErrorState`).
