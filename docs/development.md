# Development

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ (see `.nvmrc`, 24 used in development) | npm ships with it |
| Git | any recent | HTTPS remote; `gh` CLI optional |
| Rust toolchain | stable (rustup) | Desktop builds only |
| Visual Studio Build Tools | C++ workload + Windows SDK | Desktop builds only (Rust MSVC target) |
| WebView2 Runtime | preinstalled on Windows 10/11 | Desktop runtime |

Install Rust with `winget install Rustlang.Rustup` (or rustup.rs). The
`rustup` installer picks the MSVC toolchain and needs the Build Tools present.

## First run

```bash
git clone https://github.com/KK4ODA/emcomm-deployment-planner.git
cd emcomm-deployment-planner
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:5173
```

## Everyday commands

| Command | What |
|---------|------|
| `npm run dev` | Web dev server with HMR (service worker disabled in dev) |
| `npm run desktop:dev` | Same UI inside the Tauri window (starts Vite for you; first Rust compile takes minutes) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | `tsc --checkJs` over `src/` (JSDoc types) |
| `npm test` / `test:watch` / `test:coverage` | Vitest (jsdom, fake IndexedDB) |
| `npm run build` | Production web build into `dist/` (with PWA service worker) |
| `npm run preview` | Serve `dist/` locally to test the PWA |
| `npm run desktop:build` | Windows installer into `src-tauri/target/release/bundle/nsis/` |
| `npm run check` | Everything CI runs for the web |

## Project conventions

- JavaScript with JSDoc types; `npm run typecheck` must stay clean. Type
  `useMutation` variables inline (`(/** @type {Object} */ data) => ...`).
- Pure logic goes in `src/lib/` with a test next to it. Components stay thin.
- Data access only through `src/api/`; pages never import the Supabase client.
- Query keys only from `src/lib/queryKeys.js`.
- New routes: add to `src/app/routes.js`, register in `src/app/App.jsx`, add
  to `src/components/shell/navItems.js` if it belongs in navigation.
- Use the shared components (see `docs/architecture.md`) rather than ad-hoc
  Tailwind for headers, empty/error states, badges and confirmations.
- Line endings are LF (`.gitattributes`); the editor config is in `.editorconfig`.

## Testing

Tests live next to the code (`*.test.js(x)`). `src/test/supabaseMock.js`
provides a chainable mock of the Supabase client:

```js
const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));
mock.setResponse({ data: [...], error: null });
```

IndexedDB is provided by `fake-indexeddb`, so the task event log and sync
storage can be tested without a browser.

## Git workflow

- `main` is the stable branch and what releases are cut from.
- Work on branches (`feature/...`, `fix/...`), open a pull request, let CI pass,
  merge. The `modernization` branch holds the 2026-09 rework.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`, `ci:`, `test:`, `style:`); CHANGELOG entries are written
  by hand under `[Unreleased]`.
- Never commit `.env*`, certificates, `*.key`, or `src-tauri/target/`.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Blank page, console shows `VITE_SUPABASE_URL is undefined` | `.env.local` missing or dev server not restarted after editing it |
| Sign-in hangs | Check the Supabase project is not paused; the client uses a no-op lock, so a hang means the network request itself is stuck |
| "Offline" badge while online | The probe (`/auth/v1/health`) failed: firewall, captive portal or paused project. Click the badge to retry |
| Tasks created offline never sync | Open DevTools › Application › IndexedDB › `EmCommPlannerDB` › `outbox`; failed rows log `Outbox drain: Supabase rejected event` with the reason (usually RLS) |
| Old UI after deploying the web app | Service worker still serving the previous build; a reload picks it up (banner offers it). Hard-refresh if needed |
| `npm run desktop:dev` fails with `link.exe not found` | Install Visual Studio Build Tools with the C++ workload |
| `tauri build` fails on `pubkey` | `src-tauri/tauri.conf.json` must contain the updater public key (see `docs/release.md`) |
| Type errors inside `node_modules` | `jsconfig.json` sets `maxNodeModuleJsDepth: 0`; do not remove it |
