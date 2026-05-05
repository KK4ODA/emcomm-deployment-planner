# EmComm Planner: Offline-Resilient Architecture

**Status:** Draft, design phase
**Last updated:** 2026-05-05

This document specifies the architecture for making EmComm Planner functional during emergency operations when internet connectivity may be partially or entirely unavailable. It is intentionally written before code so that the data model and sync protocol survive contact with the worst case (full RF-only operation across multiple deployment sites).

---

## 1. Goals and non-goals

### Goals

1. **Single operator works fully offline.** Browser closed mid-deployment, laptop loses internet, tablet goes airplane mode — the app keeps working, and changes sync correctly when connectivity returns.
2. **Multi-operator at one site works without internet.** Several operators on a local network can share the same operational state through an EOC laptop running the VARA BBS bridge.
3. **Multi-site sync over RF is possible (not pretty).** When internet is down regionally, deployment sites can exchange critical updates over VARA HF/FM through the existing VARA BBS B2F forwarding network.
4. **No data loss under any plausible failure.** Every mutation is captured locally before it is acknowledged. Sync is eventually consistent.
5. **Operators can trust who said what.** Updates relayed over RF are cryptographically signed by the originating callsign. Forged or tampered updates are rejected.
6. **Both web and desktop deploy from the same codebase.** The browser version is the default. A Tauri wrapper is layered on top for the operator running the BBS bridge.

### Non-goals

- **Not a replacement for Winlink.** This is for operational planning data (deployments, locations, equipment, tasks, ICS 205 forms), not free-form messaging.
- **Not real-time collaboration.** No live cursors, no sub-second replication. "Eventually consistent within seconds when online, within minutes over LAN, within hours over RF" is the target.
- **Not a CRDT framework.** We will add CRDT-style merge rules where needed, not adopt a heavyweight library.
- **Not multi-tenant SaaS.** Single ARES group instance per Supabase project. Splitting across groups is handled by `ares_group_id`, not infrastructure.

---

## 2. Threat model

What we are designing against, in order of likelihood:

| # | Failure | Frequency | Impact |
|---|---------|-----------|--------|
| 1 | Operator's device loses internet briefly (cell outage, WiFi drop) | Common | High if not handled |
| 2 | EOC site loses internet for hours (storm, ISP outage) | Common during EmComm activation | High |
| 3 | Region loses internet; LAN still up at EOC | Less common but specifically the "why we exist" case | Critical |
| 4 | Two operators edit the same record while disconnected from each other | Common during chaos | High if data is silently lost |
| 5 | Multi-site activation, only RF connects sites | Rare but the worst case | Critical |
| 6 | Power loss to EOC laptop running BBS bridge | Possible | Medium (UPS expected) |
| 7 | Malicious operator on the BBS network forges updates | Low likelihood, high impact if it happens | Critical for trust |

We design for #1-5 explicitly. #6 is operational discipline (UPS, battery backup). #7 is handled via cryptographic signing.

---

## 3. Connectivity tiers

The app classifies its current connectivity into one of four tiers. Each tier dictates which sync paths are active.

```
┌──────────────────────────────────────────────────────────────┐
│ ONLINE   │ Internet works, Supabase reachable                │
│          │ Read/write directly to Supabase, Realtime active  │
├──────────┼───────────────────────────────────────────────────┤
│ LAN_ONLY │ Local network up, EOC bridge reachable            │
│          │ Internet is down                                  │
│          │ Read/write via local sync server on EOC laptop    │
├──────────┼───────────────────────────────────────────────────┤
│ BBS_ONLY │ Only the local VARA BBS is reachable              │
│          │ No LAN to other clients, no internet              │
│          │ Read from local IndexedDB; queue writes for BBS   │
├──────────┼───────────────────────────────────────────────────┤
│ OFFLINE  │ No connectivity at all                            │
│          │ Read from IndexedDB; queue all writes locally     │
└──────────────────────────────────────────────────────────────┘
```

### Tier detection

The client probes endpoints in priority order and downgrades:

1. Probe `https://<supabase>.supabase.co/rest/v1/` (HEAD, 3s timeout). Success → `ONLINE`.
2. Probe `http://<eoc-bridge>/health` (configurable host, 1s timeout). Success → `LAN_ONLY`.
3. Probe `http://localhost:<bbs-bridge-port>/health` (Tauri / EOC operator only). Success → `BBS_ONLY`.
4. Otherwise → `OFFLINE`.

Probes run on app start, on `window.online` event, on visibility change, and every 30s while in a degraded tier. A tier upgrade triggers an immediate sync attempt.

### What changes per tier

| Operation | ONLINE | LAN_ONLY | BBS_ONLY | OFFLINE |
|-----------|--------|----------|----------|---------|
| Read entities | Supabase + IndexedDB cache | Local sync server | IndexedDB | IndexedDB |
| Write entities | Supabase, mirrored to IndexedDB | Local sync server | Queue → BBS bridge | Queue |
| Realtime subscriptions | Supabase Realtime | Local server pub/sub | None (poll BBS inbox) | None |
| Login | Supabase Auth | Cached token, 24h grace | Cached token | Cached token |
| Invite user | Edge Function | Disabled | Disabled | Disabled |

---

## 4. Data model: event log + materialized views

This is the most consequential decision. **All mutations are events, not state writes.** The current state of a deployment is a materialized view over the event log.

### Why

- **Sync is trivial.** Replicating a log is easier than reconciling diverged state.
- **Conflicts become merge functions.** The log is the source of truth; views are reproducible.
- **Audit is free.** "Who changed this task on what device?" comes for free.
- **Idempotency is straightforward.** Each event has a stable ID; applying the same event twice is a no-op.
- **RF bandwidth is minimized.** A delta is one event, often <200 bytes JSON, not a full row.

### Event shape

```json
{
  "id": "01JR6P4M9KQX5ZV2TN8Y3JEXAM",
  "ts": "2026-05-05T18:42:11.342Z",
  "actor": {
    "user_id": "uuid-of-user",
    "call_sign": "KK4ODA",
    "device_id": "kk4oda-laptop-01"
  },
  "entity": "task",
  "entity_id": "uuid-of-task",
  "op": "update",
  "patch": {
    "status": "completed",
    "completed_by_call_sign": "KK4ODA"
  },
  "deployment_id": "uuid-of-deployment",
  "sig": "base64-hmac-or-ed25519-signature"
}
```

Fields:
- `id`: ULID. Sortable by time, globally unique without coordination.
- `ts`: ISO timestamp from the originating device. Used for display, not for ordering.
- `actor`: who, on what device. `device_id` is generated once per install and stored locally.
- `entity` / `entity_id`: what is being changed. `entity_id` is generated locally on `create` events using UUIDv7.
- `op`: `create` | `update` | `delete`. No `replace` — full replacements are an `update` with all fields.
- `patch`: the changed fields. For `delete`, this is empty or `{ tombstone: true }`.
- `deployment_id`: scopes the event for routing (BBS bulletin area, RLS policy).
- `sig`: signature over a canonical JSON encoding of the event minus `sig`. See §10.

### Storage layout (Supabase)

Two new tables, plus the existing entity tables become materialized views written by triggers.

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,                    -- ULID from originator
  ts TIMESTAMPTZ NOT NULL,                -- originator's claimed timestamp
  server_received_at TIMESTAMPTZ DEFAULT now(),
  actor_user_id UUID,
  actor_call_sign TEXT NOT NULL,
  actor_device_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  patch JSONB NOT NULL,
  deployment_id UUID,
  sig TEXT NOT NULL,
  applied BOOLEAN DEFAULT false           -- materialized into entity table?
);

CREATE INDEX events_entity_idx ON events (entity, entity_id, id);
CREATE INDEX events_deployment_idx ON events (deployment_id, id);
CREATE INDEX events_pending_idx ON events (applied) WHERE applied = false;

CREATE TABLE event_acks (
  event_id TEXT REFERENCES events(id),
  device_id TEXT NOT NULL,                -- which device has seen this event
  acked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, device_id)
);
```

The existing `deployments`, `tasks`, etc. tables continue to exist as **materialized views** over the event log. A Postgres trigger on `events` applies the event to the relevant entity table. This means existing UI code keeps working — it still queries `tasks` — while sync logic operates on `events`.

### Storage layout (client IndexedDB)

```
ObjectStores:
- events                  (full event log, indexed by entity_id and id)
- entities.deployments    (materialized view, current state)
- entities.tasks          (materialized view)
- entities.deployment_locations
- entities.deployment_items
- entities.categories
- entities.ics205_forms
- entities.users
- entities.ares_groups
- outbox                  (events waiting to sync upstream)
- inbox                   (events received from upstream, not yet applied)
- sync_state              (high-water marks per peer: supabase, lan, bbs)
```

The client applies events to the materialized views immediately on receipt (optimistic), and writes them to `outbox` for upstream propagation.

---

## 5. Per-entity sync semantics

Not every entity has the same conflict profile. We document each one explicitly.

| Entity | Concurrency model | Conflict resolution |
|--------|-------------------|---------------------|
| `deployments` | Single owner (admin) | Last-write-wins per field, ordered by ULID |
| `deployment_locations` | Single owner | LWW per field |
| `categories` | Single owner | LWW per field |
| `deployment_items` | Multi-writer | LWW per field, **except** `assigned_to[]` which is a set with add/remove operations |
| `tasks` | Multi-writer | LWW per field, **except** `status` which goes through an explicit state machine (see below) |
| `ics205_forms` | Single owner | LWW per field; `radio_channels[]` is replaced as a whole on edit |
| `notifications` | Per-recipient | Append-only; no edits |
| `users` | Self-edit + admin override | LWW per field |
| `ares_groups` | Admin-owned | LWW per field |
| `deployment_templates` | Admin-owned | Replace-as-whole |

### The `assigned_to[]` set merge rule

Two operators offline both reassign a piece of equipment. Naive LWW would lose one assignment. Instead, we model array fields as observed-remove sets (OR-set CRDT):

- `op: "update"`, `patch: { "assigned_to.add": "KK4ODA" }` — adds to set
- `op: "update"`, `patch: { "assigned_to.remove": "KK4ODA" }` — removes from set
- The materialized view computes the set from the log

This applies to: `assigned_to`, `assigned_call_signs`, `ares_group_ids`, `admin_user_ids`.

### The `tasks.status` state machine

Tasks transition `pending → in_progress → completed`. Conflicting transitions resolve by **most advanced state wins** (completed > in_progress > pending), with the earliest ULID breaking ties.

This avoids the embarrassing case of "operator A marks task done, operator B unmarks it, and B's clock wins."

---

## 6. Delta protocol

### Wire format

Events are exchanged in batches called **bundles**. A bundle is a JSON array of events plus a header:

```json
{
  "bundle_id": "01JR6P5XQX...",
  "from_device": "kk4oda-laptop-01",
  "from_call_sign": "KK4ODA",
  "events": [ /* array of event objects */ ],
  "manifest_sig": "base64..."
}
```

The `manifest_sig` is over the array of event IDs in order, signed by the sender's device key. This lets a receiver verify the bundle wasn't truncated or reordered without re-checking every event signature.

### Compression for RF transport

Bundles destined for VARA BBS are:

1. Reduced to minimum: single-character keys, no whitespace
2. zstd-compressed
3. base64-encoded (ASCII-safe for AX.25/B2F)
4. Split into ~250-byte chunks if needed (BBS bulletin size limits)

A typical task status update event compresses to <100 bytes on the wire. A 50-event bundle (a moderate sync round) is ~3-5 KB compressed. At VARA HF P3 throughput (~1.7 kbps effective), that's 15-25 seconds.

### Idempotency

Every event has a globally unique ULID. A receiver:
- Looks up the event ID in its `events` store
- If present, drops the event silently
- If absent, validates signature, applies to materialized views, writes to store

Bundles can be retransmitted freely. Out-of-order delivery is fine: a `delete` for an entity that doesn't exist yet creates a tombstone; a later `create` for that entity will be filtered by the tombstone.

### Ordering rules

- **Per entity:** events are applied in ULID order (which is ~timestamp order with monotonic guarantees within a device).
- **Across entities:** no global ordering required. Each entity is its own log.
- **Causality:** if operator A creates a deployment, then assigns an item, the `create` event for the item references the deployment_id. If the deployment_create event hasn't arrived yet at a peer, the assignment is held in the inbox until its prerequisite arrives.

### High-water marks

Each peer relationship tracks a high-water mark: the last ULID we know the peer has received. On sync, we send everything after the HWM. This avoids re-sending the entire log.

---

## 7. Layer architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: Cloud (Supabase)                                       │
│   - Postgres event log (events table)                           │
│   - Materialized entity tables (existing)                       │
│   - Realtime channel: events:deployment_id                      │
│   - Edge Functions: invite-user, exports, etc.                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS (when ONLINE)
┌────────────────────────────────┴────────────────────────────────┐
│ LAYER 3: LAN sync server (optional, runs at EOC)                │
│   - Lightweight Postgres or SQLite                              │
│   - Same schema as Supabase events table                        │
│   - Exposes Supabase-compatible REST + Realtime                 │
│   - Upstream-syncs to Supabase when ONLINE                      │
└──────────┬──────────────────────────────────┬───────────────────┘
           │ HTTP/WS (when LAN_ONLY)          │
┌──────────┴───────────────┐         ┌────────┴──────────────────┐
│ LAYER 2: Browser/Desktop │         │ LAYER 2: Browser/Desktop  │
│  (each operator's device)│         │  (each operator's device) │
│  - IndexedDB event log   │         │  - IndexedDB event log    │
│  - Materialized views    │         │  - Materialized views     │
│  - Outbox / inbox        │         │  - Outbox / inbox         │
│  - Sync engine           │         │  - Sync engine            │
└──────────┬───────────────┘         └────────┬──────────────────┘
           │ HTTP localhost (Tauri/EOC only)
┌──────────┴────────────────────────────────────────────────────────┐
│ LAYER 1: VARA BBS emcomm_bridge module                            │
│   - Localhost HTTP API: GET /events, POST /events, GET /health   │
│   - Owns BBS bulletin area "EMCOMM_<deployment_id>"               │
│   - Posts outbound bundles as bulletins (compressed, signed)      │
│   - Watches incoming bulletins, validates, exposes via API        │
│   - B2F forwarding moves bundles between BBSs over RF             │
└────────────────────────────────────┬───────────────────────────────┘
                                     │ B2F over VARA HF/FM (when BBS_ONLY)
                              other sites' BBSs
```

### Sync flow examples

**Online write:**
```
User clicks "Mark task complete"
  → UI optimistically applies to local materialized view
  → Event written to local IndexedDB events store
  → Sync engine: tier is ONLINE
    → POST event to Supabase /events
    → Supabase trigger applies to tasks table
    → Realtime publishes to subscribed clients
    → Other clients receive event, apply to their views
```

**Offline write, comes back online:**
```
User clicks "Mark task complete" while disconnected
  → UI optimistically applies
  → Event written to IndexedDB events store
  → Event written to outbox
  → Tier is OFFLINE; sync engine sleeps
  ...later...
  → window.online fires, tier becomes ONLINE
  → Sync engine drains outbox: POSTs each event to Supabase
  → On 200, marks event in outbox as synced
  → Sync engine fetches new events from Supabase since HWM
  → Applies inbox to local store
```

**RF-only multi-site sync:**
```
Site A operator marks a task complete (BBS_ONLY tier)
  → UI optimistically applies
  → Event in IndexedDB + outbox
  → Sync engine: tier is BBS_ONLY
  → POSTs event to localhost:<port>/events (BBS bridge)
  → BBS bridge bundles pending events for deployment_id
  → Bridge posts bundle as bulletin "EMCOMM_<deployment_id>"
  → VARA BBS B2F forwards bulletin to peer BBSs on next polling cycle
  ...some minutes later...
  → Site B's BBS receives bulletin
  → Site B's bridge picks up new bulletin, validates, exposes via API
  → Site B's clients pick up event from bridge, apply to local views
```

---

## 8. VARA BBS emcomm_bridge module

A new Python module living at `vara_bbs/emcomm_bridge/`, mounted as a sub-component of the existing BBS.

### Responsibilities

1. **Localhost HTTP API** for web/desktop clients on the same machine or LAN.
2. **Bulletin area management:** create/maintain `EMCOMM_<deployment_id>` areas in the existing BBS bulletin store.
3. **Outbound:** bundle pending events into compressed, signed bulletin posts.
4. **Inbound:** watch bulletin areas for new posts, validate signatures, decompress, expose via API.
5. **Acknowledgement:** track which devices/sites have received which events; gossip acks back so senders can stop retransmitting.

### HTTP API (localhost, port configurable, default 8765)

```
GET  /health
     → { "status": "ok", "bbs_status": "running", "version": "..." }

GET  /deployments/<id>/events?since=<ulid>
     → { "events": [...], "next_since": "<ulid>" }

POST /deployments/<id>/events
     body: { "events": [...] }
     → { "accepted": N, "rejected": [...] }

GET  /deployments/<id>/bulletins
     → list of bulletin metadata in this deployment's area

POST /admin/keys
     (sysop only) — register a callsign's public key for signature verification
```

### Bulletin format

Each bulletin is a single bundle. Subject line:
```
EMCOMM <deployment_id_short> <ulid_first_event>..<ulid_last_event>
```

Body: base64-encoded zstd-compressed JSON bundle.

### Configuration in TOML

```toml
[emcomm_bridge]
enabled = true
api_port = 8765
max_bundle_events = 50
forwarding_areas = ["EMCOMM_*"]
forward_to_bbs = ["W4ABC-1", "K4XYZ-1"]
require_signed = true
```

### Why this lives inside VARA BBS

- Reuses the existing bulletin store, B2F forwarding, transport layer, callsign registry, access control, logging, GUI.
- One process to operate. The sysop already runs the BBS during activations.
- Inherits BBS's security model (HMAC auth, role-based access).
- B2F is the proven inter-BBS transport. We don't reimplement it.

---

## 9. Tauri desktop wrapper

The browser-only deployment works for everyone. The Tauri build is specifically for the EOC operator who runs the BBS bridge.

### What Tauri adds over browser

- **Reach localhost on Windows reliably.** Browser CORS gets in the way of localhost-to-localhost; Tauri can call the bridge directly via Tauri commands.
- **Read/write filesystem.** Useful for: importing ICS forms, exporting to PDF/print, ADIF import for QSO logs (if EmComm grows that direction), bundling deployment exports as files for sneakernet sync.
- **System tray.** Bridge connection status visible without opening the app window.
- **Auto-start on boot.** Operator doesn't have to remember to start anything.
- **Offline-installable.** Bundle the React app + Tauri shell; no need to fetch from IONOS at all once installed.

### What Tauri does NOT need to add

- Not a separate codebase. The same React build that goes to IONOS goes into the Tauri shell.
- Not a separate sync engine. The browser sync engine works the same; Tauri just provides extra capabilities through `invoke()`.
- Not a duplicate of the BBS bridge. The bridge stays inside VARA BBS as Python.

### Tauri-specific commands (Rust)

```rust
// Tauri commands exposed to the frontend
#[tauri::command]
fn bridge_health() -> Result<BridgeStatus> { /* HTTP GET to localhost:8765 */ }

#[tauri::command]
fn export_deployment_pdf(deployment_id: String, out_path: String) -> Result<()> { /* save PDF */ }

#[tauri::command]
fn import_deployment_bundle(file_path: String) -> Result<usize> { /* sneakernet sync */ }

#[tauri::command]
fn get_device_id() -> Result<String> { /* persistent device id from app data dir */ }
```

The frontend uses `await invoke('bridge_health')` only when running in Tauri (detected via `window.__TAURI__`). Falls back to browser-only behavior otherwise.

---

## 10. Auth model

We have three trust planes that must agree:

1. **Identity:** who is this operator? (callsign + Supabase user record)
2. **Authorization:** what can they do? (RBAC role: admin, operator, viewer, pending)
3. **Authenticity:** did this event really come from this operator? (signature)

### Identity & authorization

Unchanged from current design. Supabase Auth, `users.app_role`, RLS policies on Supabase. When in degraded tiers, the client uses a **cached identity bundle**:

```json
{
  "user_id": "uuid",
  "call_sign": "KK4ODA",
  "app_role": "admin",
  "ares_group_ids": [...],
  "issued_at": "2026-05-05T12:00:00Z",
  "expires_at": "2026-05-12T12:00:00Z",
  "issuer_sig": "..."
}
```

Issued by Supabase (via an Edge Function on login), valid for 7 days. The local sync server and BBS bridge can verify this bundle without contacting Supabase.

### Authenticity (signing events)

Each device generates an Ed25519 keypair on first run. The public key is registered:

- With Supabase (when ONLINE): in a `device_keys` table linked to `user_id`.
- With the BBS (when registering): the bridge stores it in its callsign registry alongside the existing HMAC password.

Every event includes `sig`: an Ed25519 signature over the canonical JSON encoding of the event minus the `sig` field, using the device's private key.

Verification flow when an event arrives:

1. Look up `(actor.user_id, actor.device_id)` in the device key registry.
2. If the public key isn't known, **hold the event in inbox**, request the key out-of-band (via BBS or Supabase), retry. Drop after 24h.
3. If the public key is known, verify the signature. If invalid, log + reject.
4. Check the actor's role permits the operation on the entity (RBAC).
5. Apply the event.

### Why per-device keys not per-user

- One operator may use a phone, a tablet, and a laptop. Each is a separate device with its own key.
- If a device is lost/stolen, revoke just that key, not the operator's identity.
- Phones lose data periodically; regenerating a key on a single device is cheap.

### Key distribution

- ONLINE: keys are registered with Supabase and replicated through the event log itself (a `device_key.create` event is just another event).
- BBS_ONLY: keys are exchanged via a special bulletin area `EMCOMM_KEYS_<deployment_id>`, signed by an admin's existing key.
- Bootstrap: the first key in a deployment is established during pre-deployment setup (in person or over verified channels). Trust-on-first-use is acceptable during initial activation.

---

## 11. Conflict resolution detail

Most fields are last-write-wins by ULID. The exceptions:

### Set fields (OR-set semantics)

`assigned_to`, `assigned_call_signs`, `ares_group_ids`, `admin_user_ids`.

Operations: `<field>.add` and `<field>.remove`. The materialized view computes the set as `(all adds) - (all removes after their corresponding adds)`.

### Status state machine

`tasks.status`: pending → in_progress → completed. The materialized view picks the most-advanced state across all events; ties broken by ULID. **Backwards transitions are allowed but recorded;** the UI may show a warning if a task was un-completed.

### Replaceable wholes

`ics205_forms.radio_channels`: an array of channel definitions edited as a unit. We don't try to merge channel-level changes; the latest `update` event with a `radio_channels` field wins outright.

### Tombstones

`delete` events leave a tombstone. Subsequent `update` events on the same entity are dropped. Tombstones can be garbage-collected after a configurable retention period (default 90 days).

### User-visible conflicts

When the merge rule produces a result that contradicts what the user sees, the UI shows a small toast: *"Item updated by KK4ODA from a different device 3 minutes ago."* No modal, no friction — just transparency.

---

## 12. Phased implementation roadmap

### Phase 1: Offline-first PWA against Supabase (browser only)

Deliverables:
- Service worker registered, app shell + assets cached.
- IndexedDB store for `events`, materialized entity tables, outbox, inbox, sync_state.
- Sync engine: detects ONLINE / OFFLINE, drains outbox to Supabase, fetches new events.
- Connectivity tier indicator in UI.
- Per-entity sync semantics (LWW + set merges + status state machine) implemented as merge functions.
- Existing pages keep working — they read from IndexedDB materialized views, write events instead of direct mutations.
- Migration: write `events` table on Supabase, add trigger to materialize into existing entity tables.
- Cached identity bundle: 7-day expiry, used for offline auth.

Validation:
- Operator goes offline mid-session, makes 5 changes, comes back online → all changes sync, no duplicates.
- Two operators online edit the same task → last writer wins by ULID, no data loss.
- Two operators offline edit different fields of the same task → both fields updated when both come online.
- Two operators offline edit the same field → loser sees a small conflict toast.

Estimated effort: Largest phase. The data model migration alone is significant.

### Phase 2: VARA BBS emcomm_bridge module + RF sync

Deliverables:
- `vara_bbs/emcomm_bridge/` Python module with HTTP API, bulletin area management, signature verification.
- TOML config integration.
- BBS bulletin format spec implemented (compressed bundles).
- B2F forwarding configured to relay `EMCOMM_*` areas between sites.
- Browser client: `BBS_ONLY` tier detection, sync engine targets bridge HTTP API.
- Ed25519 signing on all events; verification on receipt.
- Device key registration flow (online + BBS-mediated).

Validation:
- Single laptop with BBS running locally, internet disabled → app keeps working, events flow through bridge.
- Two BBSs over VARA HF, EmComm Planner running on both → an event made on site A appears at site B within one polling cycle.
- Tampered bulletin → bridge rejects, logs.

### Phase 3: Tauri desktop wrapper (EOC build)

Deliverables:
- Tauri shell wrapping the existing React build.
- Windows installer (initial target).
- Tauri commands for: filesystem export, sneakernet bundle import, device ID persistence, bridge health check via Rust HTTP (bypassing CORS).
- System tray with bridge connection indicator.
- Auto-start option.
- Build pipeline: `npm run tauri build` produces both web `dist/` and desktop installer from one source.

Validation:
- Install Tauri build on EOC laptop, point at local BBS bridge → tier detection picks up bridge correctly.
- Export PDF works without internet.
- Import a deployment bundle from USB (sneakernet path).

### Phase 4: LAN sync server (optional, deferred)

Deliverables:
- Lightweight Postgres/SQLite-backed sync server.
- Same `events` schema as Supabase.
- Supabase-compatible REST + Realtime endpoints.
- Upstream-syncs to Supabase when ONLINE.
- Browser client: `LAN_ONLY` tier targets this server.

This phase is **deferred** until we know we need it. Phase 2 + Phase 1 together may cover the multi-operator-at-EOC case adequately if all operators sync through their local IndexedDB and the BBS bridge mediates sync between operators on the same LAN. We'll know after Phase 2 ships.

### Phase 5: Hardening, conflict UX, telemetry

Deliverables:
- Conflict toast UI in client.
- Sync activity log visible to user.
- Bandwidth telemetry per tier.
- Backup/restore of local IndexedDB.
- E2E test suite for offline scenarios.
- Documentation: operator manual, sysop bridge setup guide.

---

## 13. Open questions and risks

### Open questions

1. **Should `notifications` be in the event log at all?** They're per-recipient, append-only. Maybe simpler to keep them server-side only and skip offline.
2. **Reverse-clock attacks:** what if a device's clock is wrong? Events could appear "newer" than they should. Mitigation: reject events with `ts` more than 24h in the future relative to receiver's clock.
3. **Edge function migration:** the existing Edge Functions (export, what3words, etc.) assume direct Supabase access. They need to keep working when the user is online. They don't need offline support themselves, but we need to ensure they're called with current data (i.e., outbox is drained before an export).
4. **Storage size:** how big can the local IndexedDB grow? Need a retention policy for old events (e.g., archive after deployment status = `archived`).
5. **What about the 4 webhook-style Edge Functions** (notifyTaskAssignment, etc.)? In the event-sourced model, these become triggers that fire on event insertion in Supabase. Need to verify they still work when the trigger source is the events table, not direct entity updates.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Event schema changes break old clients | High over time | High | Version field on every event; clients reject events from a newer major version |
| Two operators have device IDs that collide | Very low | Medium | Use a UUIDv4 device ID, not a hash of hostname |
| BBS bridge crashes mid-sync | Medium | Low | Idempotency makes retransmission safe |
| Compressed bundle decompression bombs | Low | Medium | Cap decompressed size at 1MB; reject larger |
| Operator forgets which device has which key | Medium | Low | UI shows registered devices in profile page; revocation flow |
| Sync engine bugs cause infinite loops | Medium during dev | Medium | Rate limit sync attempts, log all errors, manual "force sync" button |
| The whole event log model is overkill for an ARES tool | Possible | Sunk cost | If validation in Phase 1 shows it's not worth it, fall back to LWW-on-rows. Decision point at end of Phase 1. |

### Decisions deferred

- LAN sync server (Phase 4) — defer until we know the need.
- iOS/Android native apps — defer indefinitely. Tauri does not yet ship mobile reliably; PWA covers mobile for now.
- CRDT library adoption — defer. Hand-rolled merge rules are cheaper for the small number of multi-writer fields we have.
- VARA HF auto-frequency-scanning integration with deployment data — interesting but out of scope.

---

## 14. Glossary

- **B2F**: Bulletin to Forward, the standard ham radio protocol for inter-BBS message forwarding. Already implemented in VARA BBS.
- **ULID**: Universally Unique Lexicographically Sortable Identifier. Like UUID, but sortable by creation time.
- **OR-set**: Observed-Remove Set, a CRDT type that allows correct merging of concurrent add/remove operations on a set.
- **HWM**: High-Water Mark. The latest event ID the local node knows a peer has received.
- **Materialized view**: A current-state table derived deterministically from the event log.
- **Tier**: One of ONLINE / LAN_ONLY / BBS_ONLY / OFFLINE; the current connectivity state of the client.
- **EOC**: Emergency Operations Center. The site running the BBS bridge during an activation.
- **Bridge**: The new emcomm_bridge module inside VARA BBS that exposes events to local clients and forwards them via bulletins.
- **Bundle**: A batch of events sent as one unit (HTTP body or BBS bulletin).
- **Tombstone**: A record that an entity was deleted, kept around so late-arriving updates know to drop themselves.

---

## 15. What we are NOT building

To keep the design honest, here's what we're explicitly choosing not to do:

- **Not a custom CRDT library.** We use specific merge rules per field. If we ever need general CRDT semantics, that's a future migration.
- **Not an offline-first GraphQL layer.** We expose REST and Supabase Realtime; that's enough.
- **Not a peer-to-peer mesh.** All sync flows through the BBS bridge or Supabase; clients don't talk directly to each other. WebRTC is out of scope.
- **Not a custom radio modem protocol.** VARA HF/FM and AETHER HF (your existing stack) handle the physical layer.
- **Not a payments or donation flow.** EmComm Planner is a tool for ARES groups, not a hosted service.
- **Not multi-device session management.** Each device is independent; signing in on a new device just registers a new key.  
