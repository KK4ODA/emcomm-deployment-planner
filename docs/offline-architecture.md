# Offline behaviour: what is shipped

**Status:** describes the code as of 2026-09-07 (v2.0 development). The
original design document ("Offline-Resilient Architecture", draft 2026-05-05)
proposed four connectivity tiers, Ed25519 device signing, OR-set merges,
tombstones and a VARA BBS bridge. None of that was built and none of it is
planned; the product roadmap (`IMPLEMENTATION_ROADMAP.md` §E) replaces it
with the simpler model below. The old draft remains in git history
(`git show v1.1.0:docs/offline-architecture.md`) for reference.

## Principles

1. **Degrade, do not fail.** The operator-facing surfaces (packet, check-in,
   NCS board, comms plan) must work with no connection. Planning surfaces may
   require one and must say so.
2. **Never show stale data without saying so.** Offline screens carry an
   "as of" stamp and the connectivity badge shows how many local changes are
   waiting to sync.
3. **Small, idempotent writes.** Offline-capable writes are intents that can
   be replayed safely: create/update/delete a task; set an assignment status.
4. **Trivial conflict rules.** Statuses move along a monotonic ladder (a late
   arriving earlier status never regresses the record); everything else is
   last-writer-wins by server timestamp. No CRDTs, no signatures.

## What works offline today

| Capability | Offline | Mechanism |
|---|---|---|
| Open the app, stay signed in | Yes, 7 days | Service worker precache of the app shell; identity bundle cached in localStorage (`emcomm_cached_identity`) |
| Read deployments, sites, items, members, positions, assignments, comms plan | Last copy loaded while online | Workbox `NetworkFirst` runtime cache of Supabase REST `GET`s (6 s timeout, 14 days) |
| Map tiles | Previously viewed areas | Workbox `CacheFirst` (30 days) |
| Create / update / complete setup tasks | Yes | Task event log: events written to IndexedDB first, queued in `outbox`, posted when online; server trigger materialises with a forward-only status machine |
| Check in / On position / Check out (own assignment, or on behalf as NCS) | Yes | Status intents written to the `intents` store first, then sent to the idempotent RPC `set_assignment_status`; retried in order when online; the packet and NCS board show "pending" until sent |
| ICS-205 PDF, operator packet print | Yes | Rendered client-side with jsPDF / print stylesheet |
| Everything else (planning edits, invitations, exports, log notes) | No | Direct Supabase writes; the error is shown |

## Components

- `src/lib/offline/storage.js`: IndexedDB `EmCommPlannerDB` (v5) with stores
  `events`, `entities.tasks`, `outbox`, `inbox` (reserved), `sync_state`,
  `intents`.
- `src/api/assignmentIntents.js`: queue, send and drain status intents;
  permanent rejections are kept with an `error` for the operator to dismiss.
- `src/api/taskEvents.js`: builds and applies task events (ULID ids, per-device
  id, actor call sign), dispatches to Supabase with a 5 s race and falls back
  to the outbox.
- `src/api/syncEngine.js`: connectivity tier (`ONLINE`/`OFFLINE`) from
  `navigator.onLine` plus a probe of `/auth/v1/health`; drains the outbox;
  pulls events above a high-water mark; subscribes to Realtime; exposes the
  pending count for the badge.
- `src/contexts/OfflineContext.jsx` and `components/shell/ConnectivityBadge.jsx`:
  UI state; clicking the badge forces a sync attempt.
- `vite.config.js`: Workbox configuration (precache globs, runtime caches,
  navigate fallback denylist for Supabase paths).

## Known limitations (tracked in IMPLEMENTATION_STATUS.md)

- The task outbox retries forever without backoff and has no user-visible
  failed list; a permanently rejected event (for example an RLS denial)
  stays queued. (The newer intents outbox does surface failures.)
- An `update` event for a task that is not in the local store is dropped
  instead of held in `inbox`.
- `syncEngine.js` has no automated tests.

## Security notes

- Events must be attributed (`actor_user_id = auth.uid()`), role-checked and
  deployment-scoped (migration 008). Offline-created events that fail these
  checks on replay are rejected by the server; the client should surface them
  as failed (see limitations).
- Cached data on a device is only as safe as the device. Sign out clears the
  cached identity but not the service worker caches; clearing site data does.
