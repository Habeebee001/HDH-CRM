/**
 * Runs PostgREST (the same REST engine Supabase uses) as a child process and
 * proxies /rest/v1/* to it. PostgREST logs in as the `authenticator` role,
 * whose password is derived from the JWT secret and set at startup, so the
 * only database credential to configure is DATABASE_URL.
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import zlib from "node:zlib";
import { pool } from "./db.ts";
import { env } from "./env.ts";
import { hmacHex } from "./crypto.ts";
import { sendJson, type Req, type Res } from "./http.ts";
import { log } from "./log.ts";

let child: ChildProcess | null = null;
let ready = false;
let stopping = false;
let restarts = 0;

export const isPostgrestReady = () => ready;

const authenticatorUri = (password: string) => {
  const url = new URL(env.databaseUrl);
  url.username = "authenticator";
  url.password = password;
  return url.toString();
};

const configure = async (jwtSecret: string) => {
  const password = hmacHex(jwtSecret, "hdh-crm/authenticator");
  // Hex only, safe to inline (ALTER ROLE does not take parameters).
  await pool.query(`alter role authenticator with login password '${password}'`);
  const host = new URL(env.databaseUrl).hostname;
  return {
    PGRST_DB_URI: authenticatorUri(password),
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions",
    PGRST_JWT_SECRET: jwtSecret,
    PGRST_JWT_SECRET_IS_BASE64: "false",
    PGRST_DB_MAX_ROWS: "1000",
    PGRST_DB_POOL: String(env.postgrestPool),
    // Close idle connections so Neon can scale to zero.
    PGRST_DB_POOL_MAX_IDLETIME: "30",
    // LISTEN needs a permanent connection: the schema cache is loaded at start.
    PGRST_DB_CHANNEL_ENABLED: "false",
    PGRST_DB_CONFIG: "false",
    // Neon's pooled endpoints (PgBouncer) need this off.
    PGRST_DB_PREPARED_STATEMENTS: host.includes("-pooler") ? "false" : "true",
    PGRST_OPENAPI_MODE: "disabled",
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_SERVER_PORT: String(env.postgrestPort),
    PGRST_ADMIN_SERVER_PORT: String(env.postgrestAdminPort),
    PGRST_LOG_LEVEL: "error",
  };
};

const waitUntilReady = async (timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !stopping) {
    const ok = await new Promise<boolean>((resolve) => {
      const request = http.get(
        { host: "127.0.0.1", port: env.postgrestAdminPort, path: "/ready", timeout: 2000 },
        (response) => {
          response.resume();
          resolve(response.statusCode === 200);
        },
      );
      request.on("error", () => resolve(false));
      request.on("timeout", () => {
        request.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

export const startPostgrest = async (jwtSecret: string) => {
  let pgrstEnv = await configure(jwtSecret);
  const launch = () => {
    ready = false;
    child = spawn(env.postgrestBin, [], {
      env: { PATH: process.env.PATH ?? "", ...pgrstEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) log.info(`[postgrest] ${line}`);
      }
    };
    child.stdout?.on("data", forward);
    child.stderr?.on("data", forward);
    child.on("error", (error) => log.error("Could not start PostgREST", error));
    child.on("exit", (code, signal) => {
      ready = false;
      if (stopping) return;
      restarts += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(restarts, 5));
      log.warn(`PostgREST exited (code ${code}, signal ${signal}); restarting in ${delay} ms`);
      setTimeout(async () => {
        // Re-apply the authenticator password in case it was changed.
        try {
          pgrstEnv = await configure(jwtSecret);
        } catch (error) {
          log.error("Could not configure the authenticator role", error);
        }
        launch();
      }, delay);
    });
    void waitUntilReady(120_000).then((ok) => {
      if (ok) {
        ready = true;
        restarts = 0;
        log.info(`PostgREST ready on 127.0.0.1:${env.postgrestPort}`);
      } else if (!stopping) {
        log.error("PostgREST did not become ready in time");
      }
    });
  };
  launch();
};

export const stopPostgrest = () => {
  stopping = true;
  child?.kill("SIGTERM");
};

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "apikey",
]);

export const proxyToPostgrest = (req: Req, res: Res, pathAndQuery: string) => {
  if (!ready) {
    sendJson(res, 503, { message: "The database API is starting, please retry in a few seconds." }, { "Retry-After": "2" });
    return;
  }
  const headers: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(name) && value !== undefined) headers[name] = value;
  }
  // The client sends the public API key as a bearer token when signed out:
  // PostgREST must then treat the request as anonymous.
  const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""))?.[1];
  if (!bearer || bearer === env.publishableKey || bearer.split(".").length !== 3) {
    delete headers.authorization;
  }
  delete headers["accept-encoding"];

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: env.postgrestPort,
      method: req.method,
      path: pathAndQuery || "/",
      headers,
    },
    (response) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(response.headers)) {
        if (!HOP_BY_HOP.has(name) && value !== undefined) out[name] = value;
      }
      out["cache-control"] = "no-store";
      const acceptsGzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
      const length = Number(response.headers["content-length"] ?? 0);
      if (acceptsGzip && (length === 0 || length > 1024) && req.method !== "HEAD" && response.statusCode !== 204) {
        delete out["content-length"];
        out["content-encoding"] = "gzip";
        out["vary"] = "Accept-Encoding";
        res.writeHead(response.statusCode ?? 502, out);
        response.pipe(zlib.createGzip({ level: 5 })).pipe(res);
      } else {
        res.writeHead(response.statusCode ?? 502, out);
        response.pipe(res);
      }
    },
  );
  upstream.on("error", (error) => {
    log.error("PostgREST proxy error", error);
    if (!res.headersSent) sendJson(res, 502, { message: "Database API unavailable" });
    else res.destroy();
  });
  req.pipe(upstream);
};
