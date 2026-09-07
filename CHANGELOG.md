# Changelog

All notable changes to EmComm Planner are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

The section for the version being released is copied into the GitHub Release
notes and into the desktop updater prompt, so keep entries user-facing.

## [Unreleased]

### Added
- **Open shifts**: operators see every open shift in the deployment on My
  assignments and can take one with a single confirmation; the coordinator
  is told. Shifts you do not qualify for, or that overlap one you already
  hold, say why. Planners can turn self sign-up off per position.

### Changed
- **Publish plan** now tells you what changed since the last publication,
  position by position, and notifies only the operators whose packet
  changed, with their changes in the notification. Operators whose packet
  did not change see no banner. Tick "Notify everyone assigned" for notes
  that concern the whole deployment.

### Security
- Server role helpers now return false, never NULL, for a caller without a
  profile row; row-level security already treated NULL as deny, but guard
  clauses inside server functions now do too.

## [2.1.0] - 2026-09-07

The after-action release: the record you kept during the event turns into
forms, hours and lessons that follow the event to next year.

### Added
- **After action** page (`/aar`): a two-minute feedback form for operators
  (optionally anonymous), linked from the packet after checkout; for
  planners, the review assembled from check-ins, the log, hours and
  feedback, with an AAR draft to copy or download as Markdown.
- **Lessons** per deployment with category, position and status. Open
  lessons are carried forward automatically when you duplicate a
  deployment and appear on Staffing as "From last time" until marked
  addressed.
- **Duplicate** now copies operational periods, positions, shifts, the
  comms plan and (optionally) re-offers the same people; pick a new start
  date and every time moves with it.
- **ICS 214** (activity log) and **ICS 205A** (communications list) PDFs
  from the Net control board.
- **Hours** page for planners: the whole group per operator and month in
  ARRL report buckets, with CSV export.

## [2.0.0] - 2026-09-07

The staffable-plan release: positions, operator packet, communications
plan, check-in and hours, on top of a security fix that isolates ARES
groups from each other. See `docs/IMPLEMENTATION_ROADMAP.md` for the
reasoning and `docs/IMPLEMENTATION_STATUS.md` for what is next.

### Security
- Read isolation between ARES groups: sites, equipment, tasks, radio plans,
  templates, the event log and member profiles are now visible only to
  members of the owning group (and admins). Previously any signed-in account
  could read all of them.
- The task event log now requires an attributed, role-checked, group-scoped
  insert; a viewer or pending account can no longer change tasks.
- Members can no longer add themselves to a group or change their own role.
  Joining a group is a request that an admin approves.
- Call signs are unique and format-checked in the database.
- Database functions have a fixed search path and are no longer callable by
  anonymous clients.

### Added
- **Check in / On position / Check out** on the packet: one tap each,
  timestamped, works offline (saved on the device and sent when signal
  returns, with a visible pending state) and confirms in plain words.
- **Net control board** (`Net control`): every live shift with who is on
  station, who has not checked in and who is not assigned, worst first;
  filter by net and time window; record a check-in on an operator's behalf;
  log notes. Usable from cache when the internet drops, with an "as of"
  time.
- **Hours without asking**: checking out records the shift's hours
  automatically (estimated from the schedule when a time is missing);
  Profile › My hours lists them by month, takes manual entries for
  planning, admin and maintenance work in seconds, and exports CSV.
- **Activity log**: check-ins, status changes and notes are recorded per
  deployment (the ICS 214 source).
- **Operator packet** (`My packet`): one phone-first page per assignment
  with the position and tactical call, report time, where to go with a
  Directions button, parking / arrival / access notes, the frequencies for
  normal, degraded and repeaters-down conditions, what to bring, who to
  report to with phone numbers, and a "what changed" banner when the plan is
  republished. Prints on one page. Operators on a phone land on it.
- **Channel library**: your repeaters, simplex channels, digital gateways
  and phone numbers entered once per ARES group, with frequency
  normalisation and standard-offset suggestions.
- **Communications plan** per deployment: pick channels from the library,
  give each a role (primary / alternate / contingency / emergency), a
  condition level (1 normal, 2 no internet or phones, 3 repeaters down), a
  function, an assignment and a net. Plan check lists what is missing.
  Exports a correctly formatted **ICS 205 PDF** (cells wrap; conditions 2
  and 3 print as extra sections) and a **CHIRP CSV** for radio programming.
- **Publish plan**: bumps the plan version with a note; everyone assigned is
  notified and sees the note on their packet until they acknowledge it.
- **Staffing**: positions (a job at a site or mobile, with tactical call,
  type, headcount, net, supervisor and requirements), shifts with muster
  times, and assignments with an offer / accept / decline flow. The Staffing
  page shows "X of Y slots covered", what is open, awaiting reply or at
  risk, and lets you create numbered positions in one go ("AID MILE 2, 4,
  6…").
- **Assign dialog with ranked candidates**: operators who meet every
  requirement and are free at that time come first; missing capabilities,
  incomplete profiles and overlapping shifts are shown inline. Offer (waits
  for acceptance) or assign as confirmed.
- **Operator capability profile** ("What I can do" on the profile page):
  licence class, modes and services, station and mobility, hours of
  independent power, home area, equipment notes. Positions are matched
  against it.
- **My positions** on My Assignments: offers with two large buttons ("I will
  be there" / "I cannot" with a reason), confirmed positions, and a way to
  withdraw. The coordinator is notified either way.
- Operational periods per deployment; deployments now have real start and
  end times, a kind (public service, activation, exercise, Field Day, net,
  training) and served agency / requesting official / tasking fields.
- Sites carry parking, arrival and access notes and a site type for the
  operator packet.
- Dashboard "Staffed" card and deployment card "Staffed" count; readiness
  now requires every slot to be confirmed.
- **Planner** role for coordinators who build deployments without being
  admins. Operators keep field actions (own profile, items, tasks) and lose
  deployment editing.
- Join requests: a new member picks their groups and waits; admins see a
  "Join requests" queue on the Members page and approve or decline.

### Changed
- Templates belong to an ARES group.
- `docs/offline-architecture.md` now documents what is actually shipped.
- Navigation: My packet, Staffing, Comms plan and Channels added; the
  planning sequence reads Deployments → Staffing → Comms plan → Sites.

### Removed
- The per-site ICS 205 editor. Radio plans are one per deployment (see
  Communications plan); the old table is kept but unused.
- Unreachable Edge Functions `export-ics205` and `get-what3words`.

## [1.1.0] - 2026-09-07

Planning and maintenance flow improvements.

### Added
- Deployment lifecycle actions on each deployment card: Mark active, Mark
  completed, Back to planning, Archive, Unarchive. Archived deployments are
  hidden from the switcher and the list by default ("Show archived").
- Readiness on deployment cards: tasks done and ICS 205 coverage per site,
  plus a "Ready" line when every item is assigned, every task is done and
  every site has a radio plan.
- When a deployment is marked completed, the app offers to save it as a
  template.
- Duplicate a deployment (with or without assignments, with or without
  setup tasks) for recurring events.
- Bulk assignment: "Assign N unassigned" on the dashboard gives every
  unclaimed item, for one site or all, to one operator (defaults to you).
- Site roster check: a site card warns when an operator has equipment or
  tasks there but is not on the roster, with one click to add them.
- Go-kit checkboxes on My Assignments: tick items as you pack; ticks are
  remembered per deployment on this device and print with the page.
- Start / Done buttons on My Assignments tasks.

### Changed
- Navigation order: Dashboard, Deployments, Sites, My Assignments, ...
- Dashboard header now reads "Deployment dashboard"; the site filter is a
  segmented control for up to five sites and shows a banner while active.
- Site cards link to "Equipment" (the dashboard filtered to that site)
  instead of "Items".
- Deployments are listed active first, then planning, completed, archived.

### Removed
- "My open tasks" panel on the dashboard; My Assignments covers it.

## [1.0.2] - 2026-09-07

### Added
- Automatic web deployment: the release pipeline uploads the web build to
  the site over SFTP after publishing; the same workflow can be run by hand
  to deploy or roll back any version.
- `version.json` in the web build so the live site version can be checked.

### Changed
- Apache cache headers: entry points are never cached, hashed assets are
  cached for a year, so new deployments show up immediately.

## [1.0.1] - 2026-09-07

### Added
- "About" tab on the profile page and an *About EmComm Planner* entry in the
  account menu: version, update channel, platform, release notes, issue
  tracker and documentation links. On the desktop app it includes a
  **Check for updates** button.

### Changed
- README rewritten with an overview, feature list, download instructions,
  offline summary and environment variable reference.

## [1.0.0] - 2026-09-06

First independent release: no Base44 code, packages or services remain.

### Added
- Windows desktop application (Tauri 2) with an NSIS installer, Start Menu
  entry, uninstaller and a portable executable.
- Secure automatic updates for the desktop app from GitHub Releases, with
  signature verification, download progress and a "Later" option.
- GitHub Actions CI (lint, type-check, tests, web and desktop builds) and a
  tag-driven release pipeline that publishes web and Windows artifacts with
  SHA-256 checksums.
- Application design system: navy/signal-orange palette, light and dark
  themes, dense operational layout, collapsible sidebar, deployment switcher,
  connectivity badge showing queued offline changes.
- Site readiness overview and "My open tasks" panel on the dashboard.
- Members table with role, ARES groups and assignment counts.
- ICS 205 export rendered locally as a real PDF (works offline).
- Map tiles, reference data and profile photos are cached for offline reloads.
- Test suite (Vitest) covering data access, auth, the task event log,
  permissions, domain logic and the updater snooze.

### Changed
- URLs are now lowercase (`/deployments`, `/sites/<id>/tasks`, ...); the old
  PascalCase paths redirect.
- Switching deployments no longer reloads the page.
- Confirmation prompts use accessible dialogs instead of browser `confirm()`.
- Sign-in uses the Supabase SDK directly instead of hand-written session
  records in localStorage.
- Password minimum length raised to 8 characters for new passwords.

### Removed
- All Base44 packages, shims, stubs and documentation (see
  `docs/base44-migration.md`).
- 35 unused npm packages and 30 unused UI component files.
- Cookie consent banner (the app sets no tracking cookies) and the
  "rotate your device" notice.

### Fixed
- Deployment "PDF" export produced a text file; ICS 205 "PDF" export saved
  JSON. Both now produce the advertised formats.
- Email change on the profile page crashed after saving.
- Deleting a member did not clear their assignments because the cleanup
  function received the wrong payload.
- Templates page showed no saved date.
