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

- 2026-09-07 **Phase 2, packet and comms plan** (migration `010`, applied):
  channel library page and editor; communications plan page (add from
  library, PACE roles, condition levels 1–3, inline editing, stale snapshot
  sync, plan check, CHIRP CSV, ICS 205 PDF from the plan with wrapping
  cells); Publish plan with change note and notifications; operator packet
  (`/packet`, `/packet/:id`) with change banner and acknowledgement,
  printable, dashboard banner and mobile redirect. Per-site ICS 205 editor
  and dead Edge Functions removed. Tests: comms (10), packet (7),
  PacketView (3). 165 tests total.

- 2026-09-07 **Phase 3, operations and the record** (migration `011`,
  applied): `activity_log`, `hour_entries`, idempotent RPC
  `set_assignment_status` (verified on the live database: applies once,
  replay is a no-op, probe data removed); intents outbox in IndexedDB v5
  drained by `syncEngine`; Check in / On position / Check out on the packet
  with pending and failed states; NCS board `/ncs` with on-behalf recording
  and log notes; hours derived on release plus manual entries and CSV on
  Profile › My hours. Tests: operations (9). 174 tests total.

- 2026-09-07 **Release v2.0.0** published (web auto-deployed, desktop
  installer signed for the updater).
- 2026-09-07 **Phase 4a, the record becomes memory** (migration `012`,
  applied): `feedback` and `lessons`; duplicate copies periods, positions,
  shifts, comms plan and people with a date shift; ICS 214 and ICS 205A
  PDFs; group hours page; `/aar` with operator feedback form (anonymous
  option, RLS-enforced), planner review, Markdown draft, lessons CRUD;
  lessons carried forward on duplicate and shown on Staffing; packet links
  to feedback after checkout. Tests: icsForms (3), aar (3), LessonsList
  (3), FeedbackForm (3). 188 tests total. Released as v2.1.0.

- 2026-09-07 **Release v2.1.0** published.
- 2026-09-07 **Phase 4b, targeted publish** (migrations `013`, `014`,
  applied): per-position packet snapshots; `publish_plan` RPC notifies only
  affected operators with a per-position diff and auto-acknowledges
  unaffected packets; dialog shows the diff and recipient count. Probing the
  RPC found `has_role()`/`is_admin()`/`deployment_visible()` returning NULL
  for a caller without a profile row; fixed in `014` (verified: unknown
  caller denied, admin path works, probes rolled back). Tests: planDiff
  (7). 195 tests total.

- 2026-09-07 **Phase 4c, open-shift board** (migration `015`, applied):
  `positions.open_signup`, `volunteer_for_shift` RPC (capacity under row
  lock, replaces a declined row, notifies creator), `openShifts()` with
  match/overlap reasons, board on My assignments, switch on the position
  form. Verified on the live database with rollback probes. Tests:
  openShifts (3), OpenShiftBoard (3). 201 tests total.

- 2026-09-07 **Phase 4d, outbox parity and sync tests**: task outbox
  dead-letters permanent rejections and stops at transient ones (order
  kept); `listDeadLetters`/`retryDeadLetter`/`discardDeadLetter` across
  both outboxes; red count + dialog on the connectivity badge;
  `syncEngine` tests (drain order, dead letter, transient stop, retry and
  discard, inbox apply and high-water mark, no status regression, counts).
  209 tests total.

- 2026-09-07 **Phase 4e, map layers** (migration `016`, applied):
  `map_layers` table; dependency-free KML/GPX/GeoJSON parser; overlays on
  the site map framed with the sites; import dialog with colour and name;
  waypoints to sites; layers copied on duplicate. Tests: geo (10). 218
  tests total.

- 2026-09-07 **Release v2.2.0** (Phase 4a-4e).

## In Progress

- Nothing mid-flight.

## Next

Phase 4 remainder, both marked "later" in the roadmap and not started:
asset registry with custody (roadmap V 9.13); objectives (V 9.16). Then
roadmap section H deferrals. Field verification with real operators is the
most valuable next step: the live database still holds only the owner
account and one test deployment, so every workflow above has been verified
by unit tests and rollback probes, not by a second person. Housekeeping still on the user: delete
the `export-ics205` and `get-what3words` Edge Functions in the dashboard and
turn on leaked-password protection under Auth.

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
