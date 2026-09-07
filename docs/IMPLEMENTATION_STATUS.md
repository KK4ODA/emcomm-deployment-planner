# Implementation Status

Development log for the roadmap in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
Update this file at the end of every implementation unit so a future session
can resume without re-deriving state, and keep the feature matrix below in
step with every shipped or changed feature.

## Feature matrix (design document §18)

Row for row against "18. Prioritized Feature Matrix" in *Emcomm Planner -
Product Vision, Requirements, and Development Roadmap*. **Update this
table in the same commit that ships or changes a feature.** Status values:
**Shipped** (in a released version, verified by tests or live probes),
**Partial** (core exists, a named part of the row is missing), **Not
started**. The version is the release the row first shipped in.

### P0 — Core

| Feature (design doc) | Status | What exists / what is missing |
|---|---|---|
| RLS / permission fixes (§16.1, items 1–4) | Shipped v2.0.0 | Migration 008: group read isolation on every table, self role-escalation closed, event log attributed and role-checked, call sign unique. 014 (v2.2.0): role helpers return false, never NULL. |
| Position → Shift → Assignment model | Shipped v2.0.0 | Migration 009, guarded status ladder, server-stamped timestamps. |
| Operator profile with capabilities and resources | Shipped v2.0.0 | Profile › "What I can do": license class, capabilities, station types, power hours, locality, equipment notes. Sign-up form unchanged. |
| Operational periods | Shipped v2.0.0 | Per deployment; shifts and comms plans can reference them. |
| Staffing board with live coverage count | Shipped v2.0.0 | `/staffing`: slots covered, open / pending / at-risk filters, realtime refresh. |
| Assignment offer / accept / decline | Shipped v2.0.0 | Decline reason, notifications both ways, withdraw. |
| Operator Packet (web + PDF, offline-cached, versioned, change-highlighted) | Shipped v2.0.0 (caveat) | Web packet, one-page print (browser print to PDF, no generated PDF file), cached offline once seen, versioned with acknowledgement. Changes arrive as a banner plus (v2.2.0) a per-position diff in the notification; fields are not highlighted inline. |
| Channel library + deployment-scoped ICS-205 | Shipped v2.0.0 | `/channels`, per-deployment plan with snapshots, ICS 205 PDF from the plan. |
| Degradation ladder (condition levels + PACE) | Shipped v2.0.0 | Condition 1–3 and P/A/C/E on every plan row, shown by condition on the packet. |
| Check-in / check-out (offline) → hour entries | Shipped v2.0.0 | Idempotent RPC, IndexedDB intents outbox, hours derived on release, manual entries. |
| Site fields: parking, arrival, access, map pin | Shipped v2.0.0 | Columns, site form, click-to-set pin, on the packet with a directions link. |
| Migration of existing data (§15.6) | Shipped v2.0.0 | Site rosters became positions, memberships mirrored from existing group ids. |

### P1 — High value

| Feature (design doc) | Status | What exists / what is missing |
|---|---|---|
| Readiness / viability checklist | Shipped v2.3.0 | `/readiness`: plan, staffing, comms, sites and logistics checks (open slots, unanswered offers, unmet requirements, double-booked operators, missing tactical calls, no net control, nets without a primary, stale channels, unpublished changes, unacknowledged packets, sites without pins or arrival notes, essential items nobody brings, overdue tasks) as a worklist with a link per line; dashboard card for planners. |
| NCS live board (staffed / uncovered / released, offline) | Shipped v2.0.0 | `/ncs`, worst-first rows, on-behalf check-in, log notes, works from cache. |
| Change notification to affected operators only, with a diff | Shipped v2.2.0 | Per-position packet snapshots; `publish_plan` notifies only changed positions with their changes; unaffected packets show no banner. |
| Deployment cloning with lessons carried forward | Shipped v2.1.0 | Copies periods, positions, shifts, people, comms plan, map layers; shifts dates; open lessons carry over and show on Staffing. |
| Structured post-event feedback + AAR assembly | Shipped v2.1.0 | `/aar`: two-minute form (anonymous option), planner review, Markdown draft, lessons. |
| Hours rollup + ARRL Form 2 / FSD-212 figures | Shipped v2.1.0 | `/hours`: per operator and month in the report's activity buckets, CSV. Figures, not the form layout. |
| ICS-214 (per person and unit) and ICS-205A | Shipped v2.1.0 | Both PDFs from the Net control board. |
| Map view with layers, GPX/KML import, static map in the packet | Shipped v2.3.0 | Layers and KML / GPX / GeoJSON import (v2.2.0); the packet now carries a small non-interactive map of the site pin over the course layers, tiles cached by the service worker once seen, tap for directions, prints. |
| Shared asset registry with custody state | Shipped v2.3.0 | `/assets` per ARES group: owner, home location, kind, serial; custody state storage / with a person / on site / retired; every move recorded by the `move_asset` RPC (any active member; planners retire); pledges against a deployment; teardown checklist with "mark all returned"; readiness flags assets not back after the event; CSV. |
| Objectives (claimable, with completion) | Shipped v2.3.0 | `/objectives` per deployment with points and categories; operators claim, release, complete and undo their own through `set_objective_status`; shown on My assignments; counts and points feed the AAR summary and Markdown; copied fresh on duplicate; readiness flags objectives never taken after the event. |
| Open-shift board + notify qualified operators | Shipped v2.3.0 | Board (v2.2.0) plus "Notify N qualified" in the assign dialog: `notify_open_shift` RPC restricts to group members, skips people already on the shift and anyone told in the last 24 hours. |
| Notification preferences (email / SMS / push) | Not started | In-app notifications only. Email and SMS need a provider account and secrets the owner must create; see the plan in the Next section. |
| CHIRP CSV export from the comms plan | Shipped v2.0.0 | |
| Served agency / tasking / authorization fields | Shipped v2.0.0 | Deployment form and packet header. |
| Roster CSV import | Shipped v2.3.0 | Members > Import roster: tolerant headers (email, call sign, name or first/last, phone, licence class, role), per-row validation and preview, sequential invitations with progress; existing members are added to the groups instead of failing; profile fields fill empty columns only (`invite-user` v3). |
| Light theme, type-scale control, mobile UX pass (§12) | Shipped v2.3.0 | Light and dark themes; text size (Compact / Default / Large / Larger) in the user menu, applied before first paint and remembered per device; phone-first packet with mobile redirect; dialogs cap at the viewport and scroll, tables scroll sideways, page headers stack. Not verified on a physical phone by a second person. |
| Code signing for Windows builds | Not done (by instruction) | No certificate; updater artifacts are minisign-signed, installers unsigned. |
| Outbox reliability: retry, backoff, dead-letter UI; `syncEngine` tests | Shipped v2.3.0 | Retry, dead-letter list with retry / discard for both outboxes, sync-engine tests (v2.2.0); exponential backoff per entry (30 s doubling to 30 min, queue order kept) for task events and check-ins; coming back online or clicking the badge forces past the backoff. |

### P2 — Advanced

| Feature (design doc) | Status |
|---|---|
| Empirical coverage map | Not started |
| Training / credential records with versioned requirement sets | Not started |
| ICS-204 generation | Not started |
| Field Day / WFD profile | Not started (`field_day` deployment kind is a label only) |
| Winlink check-in ingestion | Not started |
| LAN-hosted mode | Not started |
| Section / district rollups | Not started |
| AI-assisted AAR drafting | Not started (AAR draft is assembled deterministically) |
| AI-assisted import of a legacy assignment sheet or email | Not started |
| Safety Officer checklist as a signed artifact | Not started |
| Position naming schemes / tactical callsign generation | Partial: bulk create expands "AID MILE {n}" patterns; no saved schemes |

### P3 — Experimental

All six rows (RF / VARA-BBS sync, APRS ingestion, AREDN, propagation
prediction, mutual aid, community channel sharing): not started, per the
document's validation gates.

### Explicitly deferred or dropped

Followed as written: event sourcing limited to tasks, no Ed25519 / OR-set
work, What3Words and `export-ics205` removed from the repo (the two Edge
Functions still need deleting in the Supabase dashboard).

**Count (2026-09-07, after P1 part 3):** P0 12/12 shipped. P1 18 of 19
shipped; the one exception is Windows code signing, not done by
instruction (no certificate). Notification preferences ships as in-app
plus web push only (see its row). P2 1 partial, 10 not started. P3 0/6.

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
- 2026-09-07 **P1 sweep, part 1** (migration `017`, applied; `invite-user`
  v3 deployed): readiness checklist page and dashboard card; notify
  qualified operators about an open shift (verified with a rollback probe:
  notifies once, skips within 24 h, filters non-members); roster CSV import
  with preview. Tests: readiness (3), roster (5). 226 tests total.
- 2026-09-07 **P1 sweep, part 2**: packet map (site pin over layers,
  offline once seen); text-size control; exponential backoff with
  order-preserving hold on both outboxes, manual sync forces through.
  Tests: backoff (2). 228 tests total.
- 2026-09-07 **P1 sweep, part 3** (migration `018`, applied): asset
  registry with custody and teardown; objectives, claimable with
  completion. Both RPCs verified with rollback probes (state machine,
  custody rows, operator ladder, planner-only moves, unknown caller
  denied). Tests: assets (6), objectives (5). 239 tests total.

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
