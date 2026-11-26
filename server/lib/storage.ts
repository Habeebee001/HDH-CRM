/**
 * The subset of the Supabase Storage HTTP API used by the CRM (avatars,
 * company logos, note attachments). Files are stored in storage.objects.
 *
 *   POST|PUT /storage/v1/object/{bucket}/{name}         upload (signed-in users)
 *   POST     /storage/v1/object/sign/{bucket}/{name}    signed URL (existence check)
 *   GET      /storage/v1/object/sign/{bucket}/{name}?token=...
 *   GET      /storage/v1/object/public/{bucket}/{name}  download
 *   DELETE   /storage/v1/object/{bucket}                remove {prefixes: [...]}
 */
import { pool } from "./db.ts";
import { env } from "./env.ts";
import { signJwt, verifyJwt } from "./crypto.ts";
import { getJwtSecret, requireToken, AuthError } from "./auth.ts";
import { HttpError, readBody, readJson, sendJson, type Req, type Res } from "./http.ts";
import { log } from "./log.ts";

const storageError = (res: Res, status: number, error: string, message: string) =>
  sendJson(res, status, { statusCode: String(status), error, message });

const SAFE_NAME = /^(?!.*\.\.)(?!\/)[\w\-. /()+@=,]{1,512}$/;

const parseTarget = (rest: string) => {
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = decodeURIComponent(rest.slice(0, slash));
  const name = decodeURIComponent(rest.slice(slash + 1));
  if (!/^[\w-]{1,63}$/.test(bucket) || !SAFE_NAME.test(name)) return null;
  return { bucket, name };
};

// Types a browser may display inline. Anything else is downloaded, and every
// file is sandboxed by CSP: uploads are served from the app's own origin.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|svg\+xml)|application\/pdf|text\/plain|video\/[\w.+-]+|audio\/[\w.+-]+)$/;

/**
 * Extracts the file part of a multipart/form-data body. storage-js sends the
 * file in a field with an empty name, which Node's FormData parser rejects.
 */
const parseMultipartFile = (body: Buffer, contentType: string) => {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!match) return null;
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
  const parts: { headers: string; content: Buffer }[] = [];
  let position = body.indexOf(boundary);
  while (position !== -1) {
    position += boundary.length;
    if (body[position] === 0x2d && body[position + 1] === 0x2d) break; // final "--"
    if (body[position] === 0x0d && body[position + 1] === 0x0a) position += 2;
    const headerEnd = body.indexOf("\r\n\r\n", position);
    if (headerEnd === -1) break;
    const next = body.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;
    let contentEnd = next;
    if (body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) contentEnd -= 2;
    parts.push({
      headers: body.subarray(position, headerEnd).toString("utf8"),
      content: body.subarray(headerEnd + 4, contentEnd),
    });
    position = next;
  }
  const file =
    parts.find((part) => /filename\*?=/i.test(part.headers)) ??
    parts.find((part) => !/name="(cacheControl|metadata|contentEncoding)"/i.test(part.headers));
  if (!file) return null;
  const type = /^content-type:\s*([^\r\n;]+)/im.exec(file.headers)?.[1]?.trim();
  return { content: file.content, type };
};

const upload = async (req: Req, res: Res, rest: string) => {
  const claims = requireToken(req);
  const target = parseTarget(rest);
  if (!target) return storageError(res, 400, "invalid_key", "Invalid object name");

  const contentType = String(req.headers["content-type"] ?? "");
  const raw = await readBody(req, env.maxUploadBytes + 64 * 1024);
  let bytes: Buffer;
  let mimeType = "application/octet-stream";

  if (contentType.startsWith("multipart/form-data")) {
    const file = parseMultipartFile(raw, contentType);
    if (!file) return storageError(res, 400, "invalid_request", "No file in the upload");
    bytes = file.content;
    mimeType = file.type || mimeType;
  } else {
    bytes = raw;
    mimeType = contentType.split(";")[0].trim() || mimeType;
  }

  if (bytes.length > env.maxUploadBytes) {
    return storageError(res, 413, "Payload too large", `Files are limited to ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`);
  }

  const upsert = req.method === "PUT" || req.headers["x-upsert"] === "true";
  const { rows } = await pool.query<{ id: string }>(
    `insert into storage.objects (bucket_id, name, owner, mime_type, size, content)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (bucket_id, name) do ${
       upsert
         ? "update set owner = excluded.owner, mime_type = excluded.mime_type, size = excluded.size, content = excluded.content, created_at = now()"
         : "nothing"
     }
     returning id`,
    [target.bucket, target.name, claims.sub, mimeType.slice(0, 200), bytes.length, bytes],
  );
  if (rows.length === 0) {
    return storageError(res, 409, "Duplicate", "The resource already exists");
  }
  sendJson(res, 200, { Key: `${target.bucket}/${target.name}`, Id: rows[0].id });
};

const sign = async (req: Req, res: Res, rest: string) => {
  requireToken(req);
  const target = parseTarget(rest);
  if (!target) return storageError(res, 400, "invalid_key", "Invalid object name");
  const body = await readJson<{ expiresIn?: number }>(req);
  const { rows } = await pool.query(
    "select 1 from storage.objects where bucket_id = $1 and name = $2",
    [target.bucket, target.name],
  );
  if (rows.length === 0) return storageError(res, 400, "not_found", "Object not found");
  const expiresIn = Math.min(Math.max(Number(body.expiresIn) || 60, 1), 7 * 24 * 3600);
  const token = signJwt(
    { url: `${target.bucket}/${target.name}`, exp: Math.floor(Date.now() / 1000) + expiresIn },
    getJwtSecret(),
  );
  sendJson(res, 200, {
    signedURL: `/object/sign/${encodeURIComponent(target.bucket)}/${target.name
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?token=${token}`,
  });
};

const download = async (req: Req, res: Res, rest: string, url: URL, signed: boolean) => {
  const target = parseTarget(rest);
  if (!target) return storageError(res, 400, "invalid_key", "Invalid object name");
  if (signed) {
    const claims = verifyJwt(url.searchParams.get("token") ?? "", getJwtSecret());
    if (!claims || claims.url !== `${target.bucket}/${target.name}`) {
      return storageError(res, 400, "InvalidSignature", "Invalid or expired signature");
    }
  }
  const etagOnly = await pool.query<{ id: string }>(
    "select id from storage.objects where bucket_id = $1 and name = $2",
    [target.bucket, target.name],
  );
  const id = etagOnly.rows[0]?.id;
  if (!id) return storageError(res, 404, "not_found", "Object not found");
  const etag = `"${id}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }
  const { rows } = await pool.query<{ mime_type: string | null; content: Buffer; size: number }>(
    "select mime_type, content, size from storage.objects where id = $1",
    [id],
  );
  const object = rows[0];
  if (!object) return storageError(res, 404, "not_found", "Object not found");

  const mimeType = object.mime_type || "application/octet-stream";
  const inline = INLINE_TYPES.test(mimeType) && !url.searchParams.has("download");
  const fileName = target.name.split("/").pop() ?? "file";
  res.writeHead(200, {
    "Content-Type": mimeType,
    "Content-Length": object.content.length,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "public, max-age=604800",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    // Browsers' PDF viewers refuse to run in sandboxed documents, and they
    // never run a PDF's scripts in the page origin anyway.
    ...(mimeType === "application/pdf"
      ? {}
      : {
          "Content-Security-Policy":
            "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
        }),
    "Cross-Origin-Resource-Policy": "same-site",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(object.content);
};

const remove = async (req: Req, res: Res, rest: string) => {
  requireToken(req);
  const bucket = decodeURIComponent(rest.replace(/\/$/, ""));
  const body = await readJson<{ prefixes?: string[] }>(req);
  const names = (body.prefixes ?? []).filter((name) => typeof name === "string" && SAFE_NAME.test(name));
  const { rows } = await pool.query<{ name: string }>(
    "delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name",
    [bucket, names],
  );
  sendJson(res, 200, rows.map(({ name }) => ({ name, bucket_id: bucket })));
};

export const handleStorage = async (req: Req, res: Res, url: URL) => {
  const path = url.pathname.slice("/storage/v1".length);
  const method = req.method ?? "GET";
  try {
    if (path.startsWith("/object/public/") && (method === "GET" || method === "HEAD")) {
      return await download(req, res, path.slice("/object/public/".length), url, false);
    }
    if (path.startsWith("/object/sign/")) {
      const rest = path.slice("/object/sign/".length);
      if (method === "POST") return await sign(req, res, rest);
      if (method === "GET" || method === "HEAD") return await download(req, res, rest, url, true);
    }
    if (path.startsWith("/object/") && (method === "POST" || method === "PUT")) {
      return await upload(req, res, path.slice("/object/".length));
    }
    if (path.startsWith("/object/") && method === "DELETE") {
      return await remove(req, res, path.slice("/object/".length));
    }
    return storageError(res, 404, "not_found", "Not found");
  } catch (error) {
    if (error instanceof AuthError) return storageError(res, 403, "Unauthorized", error.message);
    if (error instanceof HttpError) return storageError(res, error.status, "invalid_request", error.message);
    log.error(`Storage error on ${method} ${path}`, error);
    return storageError(res, 500, "internal", "Internal Server Error");
  }
};
