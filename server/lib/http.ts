import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "./env.ts";

export type Req = IncomingMessage;
export type Res = ServerResponse;

export class HttpError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    body: Record<string, unknown> = {},
  ) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export const readBody = (req: Req, limit: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

export const readJson = async <T = Record<string, unknown>>(
  req: Req,
  limit = 1024 * 1024,
): Promise<T> => {
  const buffer = await readBody(req, limit);
  if (buffer.length === 0) return {} as T;
  try {
    return JSON.parse(buffer.toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
};

export const readForm = async (req: Req): Promise<URLSearchParams> => {
  const buffer = await readBody(req, 64 * 1024);
  return new URLSearchParams(buffer.toString("utf8"));
};

export const sendJson = (
  res: Res,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
};

export const sendHtml = (res: Res, status: number, html: string) => {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  res.end(html);
};

export const getBearerToken = (req: Req): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
};

export const clientIp = (req: Req): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return first || req.socket.remoteAddress || "unknown";
};

/** Public origin of the app, for links in emails and invitations. */
export const publicOrigin = (req: Req): string => {
  if (env.appUrl) return env.appUrl;
  const header = (name: string) => {
    const value = req.headers[name];
    return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
  };
  const proto = header("x-forwarded-proto") || "http";
  const host = header("x-forwarded-host") || header("host") || "localhost";
  return `${proto}://${host}`;
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const isEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value);
