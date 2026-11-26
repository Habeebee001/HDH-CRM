/**
 * The subset of the Supabase Auth (GoTrue) HTTP API that the CRM's browser
 * client (@supabase/supabase-js) uses, implemented on top of Postgres:
 *
 *   POST /auth/v1/token?grant_type=password|refresh_token
 *   POST /auth/v1/signup            first user only (becomes administrator)
 *   GET  /auth/v1/user | PUT /auth/v1/user
 *   POST /auth/v1/logout
 *   POST /auth/v1/recover           emails a password reset link
 *   GET|POST /auth/v1/verify        one-time links (invitations, resets)
 *   /auth/v1/admin/users            service_role only, when AUTH_ADMIN_API=true
 *
 * Access tokens are HS256 JWTs that PostgREST verifies with the same secret,
 * so row level security policies see the user through auth.uid().
 */
import { randomUUID } from "node:crypto";
import { pool, withTransaction, type Queryable } from "./db.ts";
import { env } from "./env.ts";
import {
  hashPassword,
  randomToken,
  sha256,
  signJwt,
  verifyJwt,
  verifyPassword,
  type JwtClaims,
} from "./crypto.ts";
import {
  clientIp,
  getBearerToken,
  HttpError,
  isEmail,
  publicOrigin,
  readForm,
  readJson,
  sendHtml,
  sendJson,
  type Req,
  type Res,
} from "./http.ts";
import { page, recoveryEmail, sendMail } from "./mail.ts";
import { allow, hit, isLimited, reset as resetLimit } from "./rateLimit.ts";
import { log } from "./log.ts";

let jwtSecret = "";
export const setJwtSecret = (secret: string) => {
  jwtSecret = secret;
};
export const getJwtSecret = () => jwtSecret;

export type DbUser = {
  id: string;
  email: string;
  encrypted_password: string | null;
  raw_user_meta_data: Record<string, unknown>;
  raw_app_meta_data: Record<string, unknown>;
  is_sso_user: boolean;
  banned_until: Date | null;
  email_confirmed_at: Date | null;
  invited_at: Date | null;
  last_sign_in_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const REFRESH_TOKEN_REUSE_SECONDS = 10;
const BAN_DURATION = "87600 hours";

// --- Errors in the GoTrue format the client understands --------------------------

export class AuthError extends HttpError {
  constructor(status: number, code: string, message: string, extra = {}) {
    super(status, message, { code, error_code: code, msg: message, ...extra });
  }
}

const sendAuthError = (res: Res, error: AuthError) =>
  sendJson(res, error.status, error.body, {
    "x-supabase-api-version": "2024-01-01",
  });

// --- Users, sessions, tokens -----------------------------------------------------

const iso = (date: Date | null | undefined) =>
  date ? new Date(date).toISOString() : undefined;

export const isBanned = (user: Pick<DbUser, "banned_until">) =>
  user.banned_until != null && new Date(user.banned_until) > new Date();

export const userJson = (user: DbUser) => ({
  id: user.id,
  aud: "authenticated",
  role: "authenticated",
  email: user.email,
  email_confirmed_at: iso(user.email_confirmed_at),
  phone: "",
  confirmed_at: iso(user.email_confirmed_at),
  invited_at: iso(user.invited_at),
  last_sign_in_at: iso(user.last_sign_in_at),
  banned_until: iso(user.banned_until),
  app_metadata: user.raw_app_meta_data ?? {},
  user_metadata: user.raw_user_meta_data ?? {},
  identities: [],
  created_at: iso(user.created_at),
  updated_at: iso(user.updated_at),
  is_anonymous: false,
});

export const findUserByEmail = async (db: Queryable, email: string) =>
  (
    await db.query<DbUser>(
      "select * from auth.users where email = $1::extensions.citext",
      [email],
    )
  ).rows[0];

export const findUserById = async (db: Queryable, id: string) =>
  (await db.query<DbUser>("select * from auth.users where id = $1", [id]))
    .rows[0];

const accessToken = (user: DbUser, sessionId: string, req: Req) => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + env.jwtExpirySeconds;
  const claims: JwtClaims = {
    aud: "authenticated",
    exp,
    iat: now,
    iss: `${publicOrigin(req)}/auth/v1`,
    sub: user.id,
    email: user.email,
    phone: "",
    app_metadata: user.raw_app_meta_data ?? {},
    user_metadata: user.raw_user_meta_data ?? {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: sessionId,
    is_anonymous: false,
  };
  return { token: signJwt(claims, jwtSecret), exp };
};

const sessionJson = (
  user: DbUser,
  sessionId: string,
  refreshToken: string,
  req: Req,
) => {
  const { token, exp } = accessToken(user, sessionId, req);
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: env.jwtExpirySeconds,
    expires_at: exp,
    refresh_token: refreshToken,
    user: userJson(user),
  };
};

const issueRefreshToken = async (
  db: Queryable,
  sessionId: string,
  userId: string,
) => {
  const refreshToken = randomToken(32);
  await db.query(
    "insert into auth.refresh_tokens (token_hash, session_id, user_id) values ($1, $2, $3)",
    [sha256(refreshToken), sessionId, userId],
  );
  return refreshToken;
};

/** Creates a session and returns it in the format of a GoTrue token response. */
export const createSession = async (db: Queryable, user: DbUser, req: Req) => {
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.sessions (user_id, user_agent, ip) values ($1, $2, $3) returning id",
    [user.id, userAgent, clientIp(req)],
  );
  const refreshToken = await issueRefreshToken(db, rows[0].id, user.id);
  const updated = (
    await db.query<DbUser>(
      "update auth.users set last_sign_in_at = now() where id = $1 returning *",
      [user.id],
    )
  ).rows[0];
  return sessionJson(updated ?? user, rows[0].id, refreshToken, req);
};

export const revokeSessions = async (
  db: Queryable,
  userId: string,
  exceptSessionId?: string,
) => {
  await db.query(
    "delete from auth.sessions where user_id = $1 and ($2::uuid is null or id <> $2::uuid)",
    [userId, exceptSessionId ?? null],
  );
};

/** One-time link for an invitation or a password reset. */
export const createOneTimeLink = async (
  db: Queryable,
  req: Req,
  userId: string,
  type: "invite" | "recovery",
) => {
  const token = randomToken(32);
  const hours = type === "invite" ? env.inviteTtlHours : env.recoveryTtlHours;
  // A new link replaces the previous unused ones of the same type.
  await db.query(
    "delete from auth.one_time_tokens where user_id = $1 and token_type = $2 and used_at is null",
    [userId, type],
  );
  await db.query(
    `insert into auth.one_time_tokens (token_hash, user_id, token_type, expires_at)
     values ($1, $2, $3, now() + make_interval(hours => $4))`,
    [sha256(token), userId, type, hours],
  );
  return `${publicOrigin(req)}/auth/v1/verify?token=${token}&type=${type}`;
};

export const validatePassword = (password: unknown): string => {
  if (typeof password !== "string" || password.length < env.minPasswordLength) {
    throw new AuthError(
      422,
      "weak_password",
      `Password should be at least ${env.minPasswordLength} characters.`,
      { weak_password: { reasons: ["length"] } },
    );
  }
  if (password.length > 200) {
    throw new AuthError(422, "weak_password", "Password is too long.", {
      weak_password: { reasons: ["length"] },
    });
  }
  return password;
};

// --- Request authentication (also used by storage and functions) -------------------

export type AuthContext = { claims: JwtClaims; user: DbUser; sessionId: string };

/** Verifies the bearer token, its session and the user. Throws AuthError. */
export const requireUser = async (req: Req): Promise<AuthContext> => {
  const token = getBearerToken(req);
  if (!token || token === env.publishableKey) {
    throw new AuthError(401, "no_authorization", "This endpoint requires a valid Bearer token");
  }
  const claims = verifyJwt(token, jwtSecret);
  if (!claims || claims.role !== "authenticated" || !claims.sub) {
    throw new AuthError(403, "bad_jwt", "invalid JWT: unable to parse or verify signature, token is expired or invalid");
  }
  const sessionId = String(claims.session_id ?? "");
  const { rows } = await pool.query<DbUser & { session_exists: boolean }>(
    `select u.*, exists (select 1 from auth.sessions s where s.id = $2::uuid and s.user_id = u.id) as session_exists
     from auth.users u where u.id = $1`,
    [claims.sub, sessionId || "00000000-0000-0000-0000-000000000000"],
  );
  const user = rows[0];
  if (!user) {
    throw new AuthError(403, "user_not_found", "User from sub claim in JWT does not exist");
  }
  if (!user.session_exists) {
    throw new AuthError(403, "session_not_found", "Session from session_id claim in JWT does not exist");
  }
  if (isBanned(user)) {
    throw new AuthError(403, "user_banned", "User is banned");
  }
  return { claims, user, sessionId };
};

/** Lighter check for high-traffic routes: a valid signature is enough. */
export const requireToken = (req: Req): JwtClaims => {
  const token = getBearerToken(req);
  const claims = token ? verifyJwt(token, jwtSecret) : null;
  if (!claims || claims.role !== "authenticated" || !claims.sub) {
    throw new AuthError(403, "bad_jwt", "invalid JWT");
  }
  return claims;
};

const requireServiceRole = (req: Req) => {
  const token = getBearerToken(req);
  const claims = token ? verifyJwt(token, jwtSecret) : null;
  if (!claims || claims.role !== "service_role") {
    throw new AuthError(403, "not_admin", "User not allowed");
  }
};

// --- Route handlers ----------------------------------------------------------------

const rateLimit = (key: string, max: number, windowMs: number) => {
  if (!allow(key, max, windowMs)) {
    throw new AuthError(429, "over_request_rate_limit", "Too many requests. Please wait a few minutes and try again.");
  }
};

const MINUTES_15 = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const passwordGrant = async (req: Req, res: Res) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    throw new AuthError(400, "validation_failed", "Missing email or password");
  }
  // Generous per address (a whole office can share one IP); strict on
  // failed attempts for one account.
  rateLimit(`login:${clientIp(req)}`, 300, MINUTES_15);
  const failures = `login-failures:${clientIp(req)}:${email}`;
  if (isLimited(failures, 10)) {
    throw new AuthError(429, "over_request_rate_limit", "Too many failed sign-in attempts. Please wait 15 minutes or reset your password.");
  }

  const user = await findUserByEmail(pool, email);
  const valid = await verifyPassword(password, user?.encrypted_password);
  if (!user || !valid) {
    hit(failures, MINUTES_15);
    throw new AuthError(400, "invalid_credentials", "Invalid login credentials");
  }
  resetLimit(failures);
  if (isBanned(user)) {
    throw new AuthError(400, "user_banned", "User is banned");
  }
  const session = await withTransaction((db) => createSession(db, user, req));
  sendJson(res, 200, session);
};

const refreshGrant = async (req: Req, res: Res) => {
  const body = await readJson<{ refresh_token?: string }>(req);
  const refreshToken = String(body.refresh_token ?? "");
  if (!refreshToken) {
    throw new AuthError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
  }
  // Errors are returned, not thrown, so that ending a session is committed.
  const result = await withTransaction(async (db) => {
    const { rows } = await db.query<{
      id: number;
      session_id: string;
      user_id: string;
      revoked_at: Date | null;
    }>(
      "select id, session_id, user_id, revoked_at from auth.refresh_tokens where token_hash = $1 for update",
      [sha256(refreshToken)],
    );
    const current = rows[0];
    if (!current) {
      return { error: new AuthError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found") };
    }
    const user = await findUserById(db, current.user_id);
    if (!user || isBanned(user)) {
      await db.query("delete from auth.sessions where id = $1", [current.session_id]);
      return { error: new AuthError(400, "user_banned", "User is banned") };
    }
    if (current.revoked_at) {
      const age = (Date.now() - new Date(current.revoked_at).getTime()) / 1000;
      if (age > REFRESH_TOKEN_REUSE_SECONDS) {
        // A token used twice may have been stolen: end the whole session.
        await db.query("delete from auth.sessions where id = $1", [current.session_id]);
        return { error: new AuthError(400, "refresh_token_already_used", "Invalid Refresh Token: Already Used") };
      }
    } else {
      await db.query("update auth.refresh_tokens set revoked_at = now() where id = $1", [current.id]);
    }
    await db.query("update auth.sessions set refreshed_at = now() where id = $1", [current.session_id]);
    const next = await issueRefreshToken(db, current.session_id, user.id);
    if (Math.random() < 0.02) {
      await db.query("delete from auth.refresh_tokens where revoked_at < now() - interval '1 day'");
    }
    return { session: sessionJson(user, current.session_id, next, req) };
  });
  if (result.error) throw result.error;
  sendJson(res, 200, result.session);
};

const signup = async (req: Req, res: Res) => {
  const body = await readJson<{
    email?: string;
    password?: string;
    data?: Record<string, unknown>;
  }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) {
    throw new AuthError(400, "validation_failed", "Unable to validate email address: invalid format");
  }
  const password = validatePassword(body.password);
  rateLimit(`signup:${clientIp(req)}`, 10, HOUR);
  const metadata = {
    first_name: String(body.data?.first_name ?? "").trim() || undefined,
    last_name: String(body.data?.last_name ?? "").trim() || undefined,
  };
  const encrypted = await hashPassword(password);

  const session = await withTransaction(async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtext('hdh-crm-signup'))");
    const { rows } = await db.query("select 1 from auth.users limit 1");
    if (rows.length > 0) {
      // Like Atomic CRM: only the first user signs up; others are invited.
      throw new AuthError(422, "signup_disabled", "Signups not allowed for this instance");
    }
    const user = (
      await db.query<DbUser>(
        `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
         values ($1, $2, $3, now()) returning *`,
        [email, encrypted, JSON.stringify(metadata)],
      )
    ).rows[0];
    return createSession(db, user, req);
  });
  log.info(`First user signed up: ${email}`);
  sendJson(res, 200, session);
};

const getUser = async (req: Req, res: Res) => {
  const { user } = await requireUser(req);
  sendJson(res, 200, userJson(user));
};

const updateUser = async (req: Req, res: Res) => {
  const { user, sessionId } = await requireUser(req);
  const body = await readJson<{
    password?: string;
    email?: string;
    data?: Record<string, unknown>;
  }>(req);
  if (body.email && body.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new AuthError(422, "email_change_not_allowed", "Ask an administrator to change your email address.");
  }
  const updated = await withTransaction(async (db) => {
    let current = user;
    if (body.password != null) {
      const encrypted = await hashPassword(validatePassword(body.password));
      current = (
        await db.query<DbUser>(
          `update auth.users
           set encrypted_password = $2, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
           where id = $1 returning *`,
          [user.id, encrypted],
        )
      ).rows[0];
      // A new password signs out the user's other devices.
      await revokeSessions(db, user.id, sessionId);
    }
    if (body.data && typeof body.data === "object") {
      current = (
        await db.query<DbUser>(
          "update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1 returning *",
          [user.id, JSON.stringify(body.data)],
        )
      ).rows[0];
    }
    return current;
  });
  sendJson(res, 200, userJson(updated));
};

const logout = async (req: Req, res: Res, url: URL) => {
  const token = getBearerToken(req);
  const claims = token ? verifyJwt(token, jwtSecret) : null;
  if (claims?.sub && claims.session_id) {
    const scope = url.searchParams.get("scope") ?? "global";
    if (scope === "local") {
      await pool.query("delete from auth.sessions where id = $1", [claims.session_id]);
    } else if (scope === "others") {
      await revokeSessions(pool, claims.sub, String(claims.session_id));
    } else {
      await revokeSessions(pool, claims.sub);
    }
  }
  res.writeHead(204, { "Cache-Control": "no-store" });
  res.end();
};

const recover = async (req: Req, res: Res) => {
  const body = await readJson<{ email?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) {
    throw new AuthError(400, "validation_failed", "Unable to validate email address: invalid format");
  }
  rateLimit(`recover:${clientIp(req)}`, 10, HOUR);
  rateLimit(`recover:${email}`, 3, HOUR);
  const user = await findUserByEmail(pool, email);
  // Same answer whether the account exists or not.
  if (user && !isBanned(user)) {
    const link = await createOneTimeLink(pool, req, user.id, "recovery");
    const sent = await sendMail(recoveryEmail({ to: user.email, link }));
    if (!sent) {
      log.warn(`Password reset requested for ${user.email}, but email is not configured. An administrator can create a password link from the Users page.`);
    }
  }
  sendJson(res, 200, {});
};

const verifyPage = async (res: Res, url: URL) => {
  const token = url.searchParams.get("token") ?? "";
  const type = url.searchParams.get("type") === "invite" ? "invite" : "recovery";
  const { rows } = await pool.query(
    `select 1 from auth.one_time_tokens
     where token_hash = $1 and token_type = $2 and used_at is null and expires_at > now()`,
    [sha256(token), type],
  );
  if (rows.length === 0) {
    sendHtml(res, 410, expiredPage());
    return;
  }
  // Link previews (WhatsApp, email scanners) only GET this page: the token
  // is used when the person clicks the button.
  sendHtml(
    res,
    200,
    page({
      title: type === "invite" ? `Welcome to ${env.appName}` : "Reset your password",
      message:
        type === "invite"
          ? "You have been invited to join the team. Continue to choose your password."
          : "Continue to choose a new password for your account.",
      form: {
        action: "/auth/v1/verify",
        fields: { token, type },
        button: type === "invite" ? "Choose my password" : "Choose a new password",
      },
    }),
  );
};

const expiredPage = () =>
  page({
    title: "This link has expired",
    message:
      "The link was already used or is too old. Ask your administrator for a new one, or use “Forgot password” on the sign-in page.",
  });

const verifySubmit = async (req: Req, res: Res) => {
  const form = await readForm(req);
  const token = form.get("token") ?? "";
  const type = form.get("type") === "invite" ? "invite" : "recovery";
  const session = await withTransaction(async (db) => {
    const { rows } = await db.query<{ user_id: string }>(
      `update auth.one_time_tokens set used_at = now()
       where token_hash = $1 and token_type = $2 and used_at is null and expires_at > now()
       returning user_id`,
      [sha256(token), type],
    );
    if (rows.length === 0) return null;
    let user = await findUserById(db, rows[0].user_id);
    if (!user || isBanned(user)) return null;
    if (type === "invite") {
      user = (
        await db.query<DbUser>(
          "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1 returning *",
          [user.id],
        )
      ).rows[0];
    }
    return createSession(db, user, req);
  });
  if (!session) {
    sendHtml(res, 410, expiredPage());
    return;
  }
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    expires_at: String(session.expires_at),
    expires_in: String(session.expires_in),
    refresh_token: session.refresh_token,
    token_type: "bearer",
    type,
  });
  // auth-callback.html hands the tokens to the app's set-password page.
  res.writeHead(303, {
    Location: `/auth-callback.html#${fragment.toString()}`,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  res.end();
};

// --- Admin API (automated tests only) -----------------------------------------------

const adminUsers = async (req: Req, res: Res, url: URL, id?: string) => {
  requireServiceRole(req);
  if (!id && req.method === "GET") {
    // auth-js sends empty values when no pagination is requested.
    const pageParam = Number(url.searchParams.get("page"));
    const perPageParam = Number(url.searchParams.get("per_page"));
    const page = pageParam > 0 ? Math.floor(pageParam) : 1;
    const perPage = perPageParam > 0 ? Math.min(1000, Math.floor(perPageParam)) : 50;
    const { rows } = await pool.query<DbUser>(
      "select * from auth.users order by created_at limit $1 offset $2",
      [perPage, (page - 1) * perPage],
    );
    const total = (await pool.query("select count(*)::int as count from auth.users")).rows[0].count;
    sendJson(res, 200, { users: rows.map(userJson), aud: "authenticated" }, { "x-total-count": String(total) });
    return;
  }
  if (!id && req.method === "POST") {
    const body = await readJson<{
      id?: string;
      email?: string;
      password?: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
    }>(req);
    if (!isEmail(body.email)) throw new AuthError(400, "validation_failed", "Invalid email");
    const encrypted = body.password ? await hashPassword(body.password) : null;
    try {
      const user = (
        await pool.query<DbUser>(
          `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
           values ($1, $2, $3, $4, case when $5 then now() end) returning *`,
          [body.id ?? randomUUID(), body.email.toLowerCase(), encrypted, JSON.stringify(body.user_metadata ?? {}), body.email_confirm === true],
        )
      ).rows[0];
      sendJson(res, 200, userJson(user));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AuthError(422, "email_exists", "A user with this email address has already been registered");
      }
      throw error;
    }
    return;
  }
  if (id && req.method === "GET") {
    const user = await findUserById(pool, id);
    if (!user) throw new AuthError(404, "user_not_found", "User not found");
    sendJson(res, 200, userJson(user));
    return;
  }
  if (id && req.method === "PUT") {
    const body = await readJson<{
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
      ban_duration?: string;
    }>(req);
    const encrypted = body.password ? await hashPassword(body.password) : null;
    const user = (
      await pool.query<DbUser>(
        `update auth.users set
           email = coalesce($2, email),
           encrypted_password = coalesce($3, encrypted_password),
           raw_user_meta_data = raw_user_meta_data || coalesce($4::jsonb, '{}'::jsonb),
           banned_until = case when $5::text is null then banned_until when $5 = 'none' then null else now() + interval '${BAN_DURATION}' end,
           updated_at = now()
         where id = $1 returning *`,
        [id, body.email ?? null, encrypted, body.user_metadata ? JSON.stringify(body.user_metadata) : null, body.ban_duration ?? null],
      )
    ).rows[0];
    if (!user) throw new AuthError(404, "user_not_found", "User not found");
    sendJson(res, 200, userJson(user));
    return;
  }
  if (id && req.method === "DELETE") {
    const user = await findUserById(pool, id);
    if (!user) throw new AuthError(404, "user_not_found", "User not found");
    await pool.query("delete from auth.users where id = $1", [id]);
    sendJson(res, 200, userJson(user));
    return;
  }
  throw new AuthError(405, "method_not_allowed", "Method not allowed");
};

// --- Router ---------------------------------------------------------------------------

export const handleAuth = async (req: Req, res: Res, url: URL) => {
  const path = url.pathname.slice("/auth/v1".length) || "/";
  const method = req.method ?? "GET";
  try {
    if (path === "/token" && method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") return await passwordGrant(req, res);
      if (grant === "refresh_token") return await refreshGrant(req, res);
      throw new AuthError(400, "unsupported_grant_type", "Unsupported grant type");
    }
    if (path === "/signup" && method === "POST") return await signup(req, res);
    if (path === "/user" && method === "GET") return await getUser(req, res);
    if (path === "/user" && method === "PUT") return await updateUser(req, res);
    if (path === "/logout" && method === "POST") return await logout(req, res, url);
    if (path === "/recover" && method === "POST") return await recover(req, res);
    if (path === "/verify" && method === "GET") return await verifyPage(res, url);
    if (path === "/verify" && method === "POST") return await verifySubmit(req, res);
    if (path === "/health" || path === "/settings") {
      const { rows } = await pool.query("select exists (select 1 from auth.users) as has_users");
      return sendJson(res, 200, {
        name: "hdh-crm-auth",
        external: { email: true },
        disable_signup: rows[0].has_users,
        mailer_autoconfirm: true,
      });
    }
    if (env.adminApi && path.startsWith("/admin/users")) {
      const id = path.slice("/admin/users".length).replace(/^\//, "") || undefined;
      return await adminUsers(req, res, url, id);
    }
    throw new AuthError(404, "not_found", "Not found");
  } catch (error) {
    if (error instanceof AuthError) return sendAuthError(res, error);
    if (error instanceof HttpError) {
      return sendAuthError(res, new AuthError(error.status, "request_error", error.message));
    }
    log.error(`Auth error on ${method} ${path}`, error);
    return sendAuthError(res, new AuthError(500, "unexpected_failure", "Unexpected failure, please try again"));
  }
};

export { BAN_DURATION };
