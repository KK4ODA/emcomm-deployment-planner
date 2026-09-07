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
  "My positions" (Accept / Decline with reason, withdraw).
- **Legacy**: `deployment_locations.assigned_call_signs` remains for the
  equipment/task views; migration 009 created one position per site that had
  a roster so nothing was lost. New staffing goes through positions.

## Deployment lifecycle

`planning → active → completed → archived`, with "back to planning",
"reopen" and "unarchive" as reverse moves (`DEPLOYMENT_TRANSITIONS` in
`src/lib/constants.js`). Lists sort by `sortDeployments()` (active first),
the switcher hides archived deployments, and marking one completed offers to
save it as a template. `deploymentReadiness()` in `src/lib/deployments.js`
computes the per-card readiness (unassigned items, tasks done, ICS 205
coverage) and `duplicateDeployment()` copies structure, optionally with
assignments and tasks (tasks go through the event log as new events).

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
