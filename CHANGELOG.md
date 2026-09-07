# Changelog

All notable changes to EmComm Planner are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

The section for the version being released is copied into the GitHub Release
notes and into the desktop updater prompt, so keep entries user-facing.

## [Unreleased]

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
