# Base44 migration record

This document is the only place in the repository that intentionally mentions Base44. It exists as a historical record; no application code depends on Base44.

## Background

The application was generated with the Base44 app builder and later exported. A first migration (commit `595d8ea`) replaced the Base44 backend with Supabase but kept a compatibility shim named `base44Client.js` so page code could keep calling `base44.entities.*`, `base44.auth.*` and `base44.functions.invoke`. The modernization work on the `modernization` branch removed that shim and every other remnant.

## Audit performed on 2026-09-06

Repository-wide search for `base44` (case-insensitive) across source, configuration, manifests, lock file, and docs. Findings, classified:

| # | Finding | Location | What it did | Class | Action |
|---|---------|----------|-------------|-------|--------|
| 1 | `@base44/sdk` dependency | `package.json`, lock file | Nothing. Not imported anywhere. Pulled in `axios` with 3 high-severity advisories. | Unused residue | Removed |
| 2 | `@base44/vite-plugin` dependency | `package.json`, lock file | Nothing. Not referenced in `vite.config.js`. | Unused residue | Removed |
| 3 | `src/api/base44Client.js` | source | Shim object `{ entities, auth, functions, users }` wrapping Supabase. `auth.me/updateMe/logout/redirectToLogin` duplicated `AuthContext`. | Code to rewrite | Replaced by `src/api/` modules with explicit names (`db.js`, `auth.js`, `functions.js`) and query hooks |
| 4 | `src/api/entities.js` | source | Generic table accessor "mimicking the Base44 SDK": `list(sort)`, `filter(criteria, sort)`, `create`, `update`, `delete`, `subscribe`. Mapped Base44 field names `created_date`/`updated_date` to `created_at`/`updated_at`. | Code to rewrite (data-model behaviour to preserve) | Rewritten as a typed repository per table with a plain `orderBy` option; `created_date` aliasing removed and all callers updated to the real column names |
| 5 | `src/api/functions.js` comment | source | Edge Function invoker documented as "mimics Base44". | Doc residue | Comment rewritten |
| 6 | `README.md` | docs | Entirely Base44 onboarding (Base44 URLs, env vars `VITE_BASE44_APP_ID`, `VITE_BASE44_APP_BASE_URL`, "Publish on Base44.com"). | Doc residue | Rewritten |
| 7 | `src/lib/app-params.js` | source | Empty stub "kept so lingering imports don't break". No imports existed. | Unused residue | Deleted |
| 8 | `src/lib/NavigationTracker.jsx` | source | No-op stub replacing Base44 telemetry. No imports existed. | Unused residue | Deleted |
| 9 | `AuthContext.isLoadingPublicSettings` | source | Always-false state kept "for compatibility with Base44 app settings". | Code to rewrite | Removed |
| 10 | `created_date` / `updated_date` usages | pages, components | Base44 column names used in sort strings and object destructuring (`Templates.jsx` displayed `template.created_date`, which is always undefined on Supabase rows). | Data-model behaviour | All usages switched to `created_at` / `updated_at` |
| 11 | `src/components/offline/offlineWrapper.jsx`, `syncManager.jsx`, `serviceWorker.jsx` | source | Pre-Supabase offline layer built on the Base44 entity shim and a hand-written service worker. Superseded by the event-log sync engine and `vite-plugin-pwa`. Not imported by anything. | Unused residue | Deleted (legacy `sync_queue` IndexedDB methods removed with it) |
| 12 | `base44.users.inviteUser` | `Members.jsx` | Base44 invitation API shape; wrapped `invite-user` Edge Function, then re-listed all users to patch `ares_group_ids`. | Backend functionality | Edge Function already accepts `aresGroupIds`; client now calls it once with role and groups |
| 13 | `error.response?.data?.error` | `Members.jsx` | Axios-style error shape from the Base44 SDK. | Code to rewrite | Uses Supabase `FunctionsHttpError` message |
| 14 | Supabase Edge Functions | `supabase/functions` | Already Base44-free (Deno + service role). `cleanup-deleted-user` still accepted a Base44 webhook-shaped payload `{ event: { type }, old_data }`. | Backend functionality | Payload simplified to `{ callSign }` (function redeployed) |

Nothing Base44-related existed in CI files (none existed), environment templates (none existed), Supabase migrations, or the PWA configuration.

## Data migration

None required. Supabase tables were created fresh during the first migration with Supabase-native column names (`created_at`, `updated_at`, UUID ids). No Base44 identifiers are persisted. The only client-visible compatibility layer was the `created_date` alias, which is now gone.

## Authentication

Authentication was already Supabase Auth (email/password, invites, password recovery). The removal deleted the duplicate `auth.me()` path in the shim; the single source of truth is `AuthContext`, which reads the `users` profile row for the signed-in Supabase user.

## Verification of independence

After removal:

- `grep -ri base44` over the repository returns matches only in this file.
- `package.json` and `package-lock.json` contain no `@base44/*` packages; `npm ls` shows no Base44 packages.
- The app installs, builds, lints, type-checks, and runs with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set.
- The test suite (Vitest) exercises the data layer, auth helpers, task event log, and permission logic without any Base44 code.
- The desktop build (Tauri) bundles the same Vite output and needs no Base44 tooling.
