# EmComm Deployment Planner

Deployment planning for Amateur Radio Emergency Service (ARES) groups: deployments, sites, equipment assignments, setup tasks, ICS 205 radio plans and member management. Built as a React web app / PWA with a Supabase backend, and packaged as a Windows desktop application.

## Quick start

Prerequisites: Node.js 20 or newer (see `.nvmrc`), npm, and a Supabase project (see [docs/backend.md](docs/backend.md)).

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production web build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` |
| `npm run typecheck` | TypeScript `checkJs` over `src/` |
| `npm test` | Vitest unit/component tests |
| `npm run check` | lint + typecheck + test + build (what CI runs) |

## Documentation

- [docs/architecture.md](docs/architecture.md): application structure, data flow, offline design
- [docs/backend.md](docs/backend.md): Supabase schema, RLS, Edge Functions, environment variables
- [docs/development.md](docs/development.md): local development, Git workflow, troubleshooting
- [docs/release.md](docs/release.md): versioning, desktop build, GitHub Actions, auto-updater, code signing
- [docs/base44-migration.md](docs/base44-migration.md): historical record of the Base44 removal
- [CHANGELOG.md](CHANGELOG.md)

## License

Private project of KK4ODA. All rights reserved unless a license file is added.
