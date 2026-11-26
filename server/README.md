# HDH CRM server

A small Node.js server (no framework, two dependencies: `pg`, `nodemailer`)
that lets the Atomic CRM front end run on **Neon** instead of Supabase. It
speaks the parts of the Supabase HTTP API the app uses, so the browser code
keeps using `@supabase/supabase-js` unchanged.

| Path              | Handled by           | Notes                                                       |
| ----------------- | -------------------- | ----------------------------------------------------------- |
| `/rest/v1/*`      | PostgREST (child)    | JWT verified by PostgREST, RLS via `auth.uid()`             |
| `/auth/v1/*`      | `lib/auth.ts`        | password sign-in, refresh-token rotation, invites, resets   |
| `/storage/v1/*`   | `lib/storage.ts`     | files in `storage.objects` (bytea), sandboxed when served   |
| `/functions/v1/*` | `lib/functions.ts`   | `users`, `update_password`, `password_link`, `merge_contacts` |
| `/config.js`      | `lib/static.ts`      | runtime config (`supabaseUrl` = current origin)             |
| everything else   | `lib/static.ts`      | `dist/`, brotli/gzip, immutable caching for `/assets`       |
| `/healthz`        | `index.ts`           | 200 when PostgREST is ready                                 |

## Database

- `db/migrations/0001_init.sql` is Atomic CRM's declarative schema
  (`supabase/schemas/01..08`) plus the platform objects Supabase provided
  (`db/prelude.sql`: roles, `auth`, `storage`, `extensions`). Functions that
  needed the `http` / `pg_net` extensions (unavailable on Neon) were rewritten.
- Migrations run at start-up (`RUN_MIGRATIONS=false` to skip) and are tracked
  in `hdh_meta.migrations`. Add new ones as `0002_*.sql`, …
- The server connects as the database owner (bypasses RLS: every endpoint
  checks permissions). PostgREST connects as `authenticator` (password derived
  from the JWT secret, set at start-up) and switches to `anon` /
  `authenticated` per request.

## Running locally

```sh
npm --prefix server ci                      # server dependencies
npm run build                               # builds dist/ (NODE_ENV=CI to skip the visualizer)
DATABASE_URL=postgresql://user:pass@localhost:5432/hdhcrm \
POSTGREST_BIN=/path/to/postgrest \
node server/index.ts                        # http://localhost:8080
```

PostgREST binaries: <https://github.com/PostgREST/postgrest/releases> (v16.6).

For front-end work with hot reload, run the server with
`CORS_ORIGINS=http://localhost:5173` and start Vite with
`VITE_SUPABASE_URL=http://localhost:8080 VITE_SB_PUBLISHABLE_KEY=hdh-crm-public-key npm run dev`.
`npm run dev:demo` needs no backend at all (fake data in the browser).

## Tests

Atomic CRM's Playwright suite runs against this server:

```sh
sudo -u postgres psql -d hdhcrm -f server/test/service-role.sql   # local only
AUTH_ADMIN_API=true node server/index.ts &
SERVICE_ROLE_KEY=$(node server/test/mint-service-key.ts) \
PLAYWRIGHT_BASE_URL=http://localhost:8080 VITE_SUPABASE_URL=http://localhost:8080 \
VITE_SB_PUBLISHABLE_KEY=hdh-crm-public-key CI=1 npx playwright test
```

`AUTH_ADMIN_API` and `service_role` exist only for these tests: never enable
them in production.
