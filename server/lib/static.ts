/** Serves the built single-page app (dist/) and its runtime config.js. */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { emailConfigured, env } from "./env.ts";
import type { Req, Res } from "./http.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map", ".svg", ".txt", ".xml", ".ico"]);

// Never cached: they point to the current build.
const NO_CACHE = new Set(["/index.html", "/sw.js", "/registerSW.js", "/manifest.webmanifest", "/manifest.json", "/auth-callback.html"]);

type Entry = { body: Buffer; br?: Buffer; gzip?: Buffer; etag: string; type: string; mtimeMs: number };
const cache = new Map<string, Entry>();

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const load = async (file: string): Promise<Entry | null> => {
  let info;
  try {
    info = await stat(file);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs) return cached;
  const body = await readFile(file);
  const ext = path.extname(file).toLowerCase();
  const entry: Entry = {
    body,
    etag: `"${createHash("sha1").update(body).digest("base64url")}"`,
    type: MIME[ext] ?? "application/octet-stream",
    mtimeMs: info.mtimeMs,
  };
  if (COMPRESSIBLE.has(ext) && body.length > 1024) {
    entry.br = zlib.brotliCompressSync(body, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length },
    });
    entry.gzip = zlib.gzipSync(body, { level: 9 });
  }
  cache.set(file, entry);
  return entry;
};

const send = (req: Req, res: Res, entry: Entry, urlPath: string) => {
  const cacheControl = NO_CACHE.has(urlPath)
    ? "no-cache"
    : urlPath.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";
  const headers: Record<string, string | number> = {
    "Content-Type": entry.type,
    "Cache-Control": cacheControl,
    ETag: entry.etag,
    Vary: "Accept-Encoding",
    ...securityHeaders,
  };
  if (req.headers["if-none-match"] === entry.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const accepted = String(req.headers["accept-encoding"] ?? "");
  let body = entry.body;
  if (entry.br && /\bbr\b/.test(accepted)) {
    body = entry.br;
    headers["Content-Encoding"] = "br";
  } else if (entry.gzip && /\bgzip\b/.test(accepted)) {
    body = entry.gzip;
    headers["Content-Encoding"] = "gzip";
  }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
};

export const serveStatic = async (req: Req, res: Res, pathname: string) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = "/";
  }
  const urlPath = decoded === "/" ? "/index.html" : decoded;
  const file = path.join(env.distDir, path.normalize(urlPath));
  if (!file.startsWith(env.distDir + path.sep)) {
    res.writeHead(400);
    res.end();
    return;
  }
  const entry = await load(file);
  if (entry) return send(req, res, entry, urlPath);

  // Unknown paths without an extension are app routes: serve the app.
  if (!path.extname(urlPath)) {
    const index = await load(path.join(env.distDir, "index.html"));
    if (index) return send(req, res, index, "/index.html");
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...securityHeaders });
  res.end("Not found");
};

/** Runtime settings for the browser (see src/components/atomic-crm/root/config.ts). */
export const serveConfig = (res: Res) => {
  const settings = {
    supabasePublishableKey: env.publishableKey,
    attachmentsBucket: env.attachmentsBucket,
    emailEnabled: emailConfigured(),
  };
  // The API lives on the same origin as the app, whatever its domain.
  const script = `window._atomicCrmConfig = Object.assign({ supabaseUrl: window.location.origin }, ${JSON.stringify(settings, null, 2)});\n`;
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-cache",
    ...securityHeaders,
  });
  res.end(script);
};
