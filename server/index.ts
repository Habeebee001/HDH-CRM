/**
 * HDH CRM server: one process that serves the app and everything it needs,
 * with Neon as the only external service.
 *
 *   /rest/v1/*       -> PostgREST (child process), row level security applies
 *   /auth/v1/*       -> sign-in, sessions, invitations, password resets
 *   /storage/v1/*    -> uploaded files, stored in Postgres
 *   /functions/v1/*  -> user management, contact merge
 *   everything else  -> the built app (dist/)
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import { runMigrations } from "./db/migrate.ts";
import { pool } from "./lib/db.ts";
import { emailConfigured, env } from "./lib/env.ts";
import { log } from "./lib/log.ts";
import { handleAuth, setJwtSecret } from "./lib/auth.ts";
import { handleStorage } from "./lib/storage.ts";
import { handleFunctions } from "./lib/functions.ts";
import { startWeeklySummaryScheduler } from "./lib/weeklySummary.ts";
import {
  isPostgrestReady,
  proxyToPostgrest,
  startPostgrest,
  stopPostgrest,
} from "./lib/postgrest.ts";
import { serveConfig, serveStatic } from "./lib/static.ts";
import { sendJson, type Req, type Res } from "./lib/http.ts";

const API_PREFIXES = ["/rest/v1", "/auth/v1", "/storage/v1", "/functions/v1"];

const applyCors = (req: Req, res: Res, pathname: string) => {
  const origin = req.headers.origin;
  if (!origin || !API_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return false;
  if (!env.corsOrigins.includes(origin) && !env.corsOrigins.includes("*"))
    return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range, range-unit, accept-profile, content-profile, x-upsert, cache-control, x-region",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "content-range, content-location, x-total-count, x-supabase-api-version, preference-applied",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
};

const handler = async (req: Req, res: Res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const { pathname } = url;
  try {
    if (applyCors(req, res, pathname)) return;
    if (pathname === "/healthz") {
      const ok = isPostgrestReady();
      return sendJson(res, ok ? 200 : 503, { ok, postgrest: ok });
    }
    if (pathname === "/rest/v1" || pathname.startsWith("/rest/v1/")) {
      return proxyToPostgrest(
        req,
        res,
        pathname.slice("/rest/v1".length) + url.search,
      );
    }
    if (pathname.startsWith("/auth/v1/"))
      return await handleAuth(req, res, url);
    if (pathname.startsWith("/storage/v1/"))
      return await handleStorage(req, res, url);
    if (pathname.startsWith("/functions/v1/"))
      return await handleFunctions(req, res, url);
    if (pathname === "/config.js") return serveConfig(res);
    return await serveStatic(req, res, pathname);
  } catch (error) {
    log.error(`Unhandled error on ${req.method} ${pathname}`, error);
    if (!res.headersSent)
      sendJson(res, 500, { message: "Internal Server Error" });
    else res.destroy();
  }
};

/** The JWT secret: JWT_SECRET, or one generated on first start and kept in the database. */
const loadJwtSecret = async () => {
  if (env.jwtSecret) {
    if (env.jwtSecret.length < 32)
      throw new Error("JWT_SECRET must be at least 32 characters long");
    return env.jwtSecret;
  }
  const { rows } = await pool.query<{ value: string }>(
    `insert into auth.settings (key, value) values ('jwt_secret', $1)
     on conflict (key) do update set key = excluded.key
     returning value`,
    [randomBytes(48).toString("base64url")],
  );
  return rows[0].value;
};

const main = async () => {
  if (!env.databaseUrl) {
    log.error(
      "DATABASE_URL is not set. Paste your Neon connection string into the DATABASE_URL variable.",
    );
    process.exit(1);
  }
  log.info(
    `Starting ${env.appName} server (database host: ${new URL(env.databaseUrl).hostname})`,
  );

  if (env.runMigrations) {
    const applied = await runMigrations(pool);
    log.info(
      applied.length
        ? `Applied migrations: ${applied.join(", ")}`
        : "Database schema is up to date",
    );
  }

  const secret = await loadJwtSecret();
  setJwtSecret(secret);
  await startPostgrest(secret);

  const server = http.createServer((req, res) => void handler(req, res));
  server.keepAliveTimeout = 65_000;
  server.listen(env.port, env.host, () => {
    log.info(`Listening on http://${env.host}:${env.port}`);
    log.info(
      emailConfigured()
        ? `Email: enabled (SMTP ${env.smtp.host})`
        : "Email: not configured. Invitations and password resets give links to share instead.",
    );
    startWeeklySummaryScheduler();
  });

  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
    stopPostgrest();
    server.close(() => void pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

main().catch((error) => {
  log.error("Server failed to start", error);
  process.exit(1);
});
