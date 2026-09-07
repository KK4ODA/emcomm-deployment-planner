# Implementation Status

Development log for the roadmap in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
Update this file at the end of every implementation unit so a future session
can resume without re-deriving state.

## Completed

- 2026-09-07: Roadmap and gap analysis written; live schema and RLS audited
  (confirmed: 8 tables readable by any authenticated user, event log writable
  by any authenticated user, self-service group membership, no call-sign
  uniqueness).

## In Progress

- Phase 0: security and roles (migration 008 + client changes).

## Next

1. Phase 1: positions, shifts, assignments, operator profile, staffing board.
2. Phase 2: channel library, comms plan, ICS-205 from plan, operator packet.
3. Phase 3: check-in/out with offline intents, NCS board, hours.

## Deferred

See roadmap §H.

## Decisions

- Keep `ares_groups` as the organization table; add `memberships`; mirror
  active memberships into `users.ares_group_ids` by trigger (read-only for
  clients) so existing access checks keep working.
- Roles remain global; add `planner`. Operators lose plan editing.
- Position requirements are JSONB on the position; operator capabilities are
  arrays/scalars on `users`. Matching runs client-side in pure functions.
- Comms plan channels are snapshots of library rows.
- Operational writes (assignment status) use a small idempotent intents
  outbox applied by an RPC; the task event log is unchanged.
- Version bump to 2.0.0 for this body of work.

## Issues

- `docs/offline-architecture.md` describes an unimplemented design; to be
  rewritten in Phase 0.
- `export-ics205` and `get-what3words` Edge Functions are deployed but
  unreachable from the client; leave until Phase 2 replaces ICS-205, then
  delete.
