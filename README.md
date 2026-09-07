# EmComm Deployment Planner

[![CI](https://github.com/KK4ODA/emcomm-deployment-planner/actions/workflows/ci.yml/badge.svg)](https://github.com/KK4ODA/emcomm-deployment-planner/actions/workflows/ci.yml)
[![Release](https://github.com/KK4ODA/emcomm-deployment-planner/actions/workflows/release.yml/badge.svg)](https://github.com/KK4ODA/emcomm-deployment-planner/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/KK4ODA/emcomm-deployment-planner?label=latest)](https://github.com/KK4ODA/emcomm-deployment-planner/releases/latest)

Deployment planning for Amateur Radio Emergency Service (ARES) groups. Plan an
activation once, hand every operator a clear picture of where to go, what to
bring, what to set up and which frequencies to use, and keep that picture
current in the field even when the network is not.

One React codebase ships three ways: a website, an installable Progressive Web
App, and a Windows desktop application with automatic updates. The backend is
Supabase (Postgres with row-level security, Auth, Storage, Edge Functions).

## About

EmComm Planner was written by KK4ODA for ARES group activations: served-agency
events, exercises and real incidents where a group stands up several sites,
staffs them from a roster and needs the plan to survive a dead cell tower.

It is opinionated about a few things:

- **Deployments are the unit of work.** Every site, item, task and radio plan
  belongs to one deployment; switching deployments switches the whole app.
- **The field comes first.** The app opens and stays signed in without a
  connection, tasks can be created and completed offline and sync later, and
  the ICS 205 prints from the device without a server.
- **Operators are identified by call sign** everywhere: assignments, exports,
  member lists.
- **Nothing proprietary in the stack.** Standard React, Supabase, Tauri and
  GitHub Actions; the repository contains everything needed to run your own
  instance.

## Features

| Area | What you get |
|------|--------------|
| Deployments | Status lifecycle (planning → active → completed → archived) with one-click transitions, readiness at a glance (unassigned items, tasks done, ICS 205 coverage), duplicate for recurring events, templates, per-ARES-group visibility |
| Sites | Locations with coordinates (decimal or DMS entry), map view with OpenStreetMap/Esri tiles, contact and access notes, operator roster with a consistency check against assignments |
| Equipment | Categories and items per site, drag-and-drop ordering, priorities, assignment to one or more operators, bulk "assign all unassigned" |
| Tasks | Setup/teardown tasks per site with forward-only status, assignees, due times; work offline and sync via an event log |
| ICS 205 | Incident Radio Communications Plan editor with saved versions and a real PDF export rendered on the device |
| Members | Roles (admin, operator, viewer, pending), ARES group membership, invitations, profile photos, call sign validation |
| My assignments | Personal view of every item, task and site for the signed-in operator, with go-kit tick boxes and Start / Done buttons; printable |
| Notifications | In-app notifications for assignments and changes |
| Exports | Deployment summary text export, ICS 205 PDF |
| Platforms | Web, installable PWA (desktop and mobile), Windows desktop app with signed auto-updates |
| Design | Dense operational layout, light and dark themes, keyboard navigation, screen-reader labels, works from phone to widescreen |

## Get it

| Platform | How |
|----------|-----|
| Windows 10/11 | Download `EmComm-Planner_<version>_x64-setup.exe` from the [latest release](https://github.com/KK4ODA/emcomm-deployment-planner/releases/latest). Installs per user (no admin rights), adds a Start Menu entry and updates itself. A portable `.exe` is also attached. |
| Any browser | https://emcommplanner.org (same version as the desktop app; `/version.json` shows which). Use the browser's *Install app* option to get an icon and offline start. |
| Self-host | Deploy the `emcomm-planner-web-<version>.zip` from a release (or `dist/` from `npm run build`) to any static host; `public/.htaccess` covers Apache. The *Deploy web* workflow does this automatically for the official site. Point it at your Supabase project via the build-time environment variables below. |

Windows builds are currently **unsigned**: SmartScreen shows "Windows
protected your PC" on first run until you click *More info › Run anyway*.
Verify a download against `SHA256SUMS.txt` on the release page. Updates are
verified with a signature that is compiled into the app, independent of
Authenticode; see [docs/release.md](docs/release.md#code-signing-authenticode).

Inside the app, **Profile › About** (or the account menu › *About EmComm
Planner*) shows the version, platform, a *Check for updates* button on the
desktop and links to release notes and the issue tracker.

## Offline behaviour

| Capability | Offline |
|------------|---------|
| Open the app, navigate, stay signed in (up to 7 days) | Yes |
| View deployments, sites, items, members | Last loaded copy |
| Create, update, complete tasks | Yes, queued and synced automatically |
| ICS 205 PDF export | Yes |
| Edit sites and items, assign, invite, deployment text export | Needs a connection |

The connectivity badge in the top bar shows the current state and how many
changes are waiting to sync. Full table in
[docs/architecture.md](docs/architecture.md#offline-behaviour).

## Quick start (development)

Prerequisites: Node.js 20 or newer (`.nvmrc` pins 24), npm, and a Supabase
project set up as described in [docs/backend.md](docs/backend.md). A Rust
toolchain is only needed for desktop builds.

```bash
git clone https://github.com/KK4ODA/emcomm-deployment-planner.git
cd emcomm-deployment-planner
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with hot reload |
| `npm run desktop:dev` | Same UI inside the Tauri desktop window |
| `npm run check` | Lint, type-check, tests and web build (what CI runs) |
| `npm run build` | Production web build with service worker into `dist/` |
| `npm run desktop:build` | Windows installer and portable exe |
| `npm run release:patch` | Bump version, commit and tag; push with `--follow-tags` to publish |

More in [docs/development.md](docs/development.md).

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | `.env.local`, GitHub secret | Supabase project URL, baked into the build |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, GitHub secret | Supabase publishable (anon) key; access is enforced by RLS |
| `TAURI_SIGNING_PRIVATE_KEY` | GitHub secret, local shell | Signs desktop updates |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | GitHub secret | Password of that key (empty if none) |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` | GitHub secret, optional | Authenticode code signing |
| `WEB_DEPLOY_HOST`, `WEB_DEPLOY_USER`, `WEB_DEPLOY_PASSWORD` | GitHub secret, optional | Automatic upload of the web build to the Apache host (`WEB_DEPLOY_PATH` if the login is not the web root) |

`.env.example` lists the client variables with placeholders. Never commit
`.env.local`, keys or certificates.

## Architecture in one paragraph

Pages are thin route components; each domain area lives in `src/features/`;
data access goes through repositories in `src/api/` and React Query hooks in
`src/hooks/useEntities.js`; pure logic lives in `src/lib/` with tests beside
it. Tasks are stored as an append-only event log in IndexedDB and Postgres so
they can be edited offline and merged deterministically. `src-tauri/` wraps
the same build in a WebView2 window and adds the updater. Details, diagrams
and the design system are in [docs/architecture.md](docs/architecture.md).

## Releasing

`package.json` holds the version; everything else (installer, UI, updater
manifest, artifact names) derives from it. Pushing a `vX.Y.Z` tag runs the
release workflow, which verifies, builds the web bundle and the Windows
installer, signs the update, and publishes a GitHub Release with checksums.
Installed desktop apps pick the new version up on their next launch.
Procedure and required repository secrets: [docs/release.md](docs/release.md).

## Documentation

- [docs/architecture.md](docs/architecture.md): structure, data flow, state, offline design, design system
- [docs/backend.md](docs/backend.md): Supabase schema, RLS, Edge Functions, environment variables
- [docs/development.md](docs/development.md): prerequisites, commands, conventions, Git workflow, troubleshooting
- [docs/release.md](docs/release.md): versioning, desktop build, GitHub Actions, auto-updater, code signing
- [docs/offline-architecture.md](docs/offline-architecture.md): task event log and sync engine
- [docs/base44-migration.md](docs/base44-migration.md): historical record of the 2026 migration off the original low-code platform
- [CHANGELOG.md](CHANGELOG.md)

## Contributing

Work on a branch, keep `npm run check` green, write Conventional Commit
messages and add a line under `[Unreleased]` in the changelog for anything a
user would notice. Bug reports and feature requests go to the
[issue tracker](https://github.com/KK4ODA/emcomm-deployment-planner/issues).

## Credits and license

Built and maintained by KK4ODA, with Claude (Anthropic) as pair programmer for
the 2026 modernization. Map tiles © OpenStreetMap contributors and Esri.
ICS 205 follows the FEMA/NIMS form layout.

Private project. All rights reserved unless a license file is added.
