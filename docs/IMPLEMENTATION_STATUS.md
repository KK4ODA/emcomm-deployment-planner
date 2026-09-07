# Implementation Status

Development log for the roadmap in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
Update this file at the end of every implementation unit so a future session
can resume without re-deriving state.

## Completed

- 2026-09-07 **Analysis**: roadmap and gap analysis written; live schema and
  RLS audited.
- 2026-09-07 **Phase 0, security and roles** (migration `008`, applied to
  production; commit `feat!: group read isolation…`): memberships table with
  approval flow and mirror trigger; every table scoped to group membership;
  event log attributed and role-checked; self role-escalation closed; call
  sign unique; functions hardened; planner role; join-request UI and admin
  approval queue; `invite-user` Edge Function v2 deployed. Verified with a
  no-group JWT: zero rows visible on users/deployments/sites/events.
- 2026-09-07 **Phase 1, the staffable plan** (migration `009`, applied):
  operational periods, positions, shifts, assignments with guarded status
  ladder and notifications; operator capability columns; site logistics
  columns; deployment schedule/profile/authorization/plan-version columns;
  existing site roster migrated to a position. Client: Staffing page,
  position form (requirements + shifts), bulk create, assign dialog with
  ranked candidates, operational periods dialog, capability profile card,
  My positions with accept/decline, deployment form (timestamps, kind,
  authorization), site form (parking/arrival/access, type), dashboard and
  deployment-card staffing counts. Tests: staffing logic (17), memberships,
  permissions, OfferList, PositionCard.

## In Progress

- Nothing mid-flight. Next unit is Phase 2.

## Next

1. **Phase 2, packet and comms plan**: migration 010 (`channels`,
   `comms_plans`, `comms_plan_channels`); channel library page; comms plan
   page with PACE roles and condition levels; ICS-205 PDF generated from the
   plan (wrapping cells; replaces the per-site editor); operator packet
   route `/packet` (above the fold: position, TAC, site, report time,
   primary frequency; then map link, parking/arrival/access, supervisor,
   frequencies for every condition, equipment, briefing notes; printable;
   change banner from `plan_version` vs `packet_version_seen`); "Publish
   changes" action on the deployment.
2. **Phase 3, operations**: migration 011 (`activity_log`, `hour_entries`,
   RPC `set_assignment_status`); intents outbox in `syncEngine`; check in /
   on position / check out on the packet; NCS board `/ncs`; hours on profile.
3. Phase 4 items in roadmap order.

## Deferred

See roadmap §H. Additionally deferred from Phase 1: per-shift notes in the
packet (stored, not yet displayed), supervisor phone on the packet (needs
Phase 2 packet), CSV export of the staffing board.

## Decisions

- Keep `ares_groups` as the organization table; add `memberships`; mirror
  active memberships into `users.ares_group_ids` by trigger (read-only for
  clients) so existing access checks keep working.
- Roles remain global; add `planner`. Operators lose plan editing.
- Position requirements are JSONB on the position; operator capabilities are
  arrays/scalars on `users`. Matching runs client-side in pure functions;
  an empty profile field counts as "unknown", not as a failure.
- Assignment status changes in Phase 1 are direct row updates guarded by a
  trigger; Phase 3 wraps them in an idempotent RPC for the offline outbox.
- `deployments.start_date/end_date` are kept and derived from
  `starts_at/ends_at` by the client so older readers keep working.
- Comms plan channels will be snapshots of library rows.
- Version bump to 2.0.0 for this body of work.

## Issues

- Not verified end-to-end in a browser with real data (no credentials in the
  development session). Verified by unit/component tests, typecheck, build
  and SQL probes against the live database.
- `export-ics205` and `get-what3words` Edge Functions are deployed but
  unreachable from the client; delete after Phase 2.
- The per-site ICS-205 button on site cards still exists until Phase 2
  replaces it.
- Task outbox has no retry cap or dead-letter view (roadmap P1).
