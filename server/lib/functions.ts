/**
 * Replacements for Atomic CRM's Supabase edge functions, reachable at the
 * same URLs so the browser code keeps calling supabase.functions.invoke():
 *
 *   POST  /functions/v1/users            invite a user (administrators)
 *   PATCH /functions/v1/users            update a user / own profile
 *   PATCH /functions/v1/update_password  password link for the current user
 *   POST  /functions/v1/password_link    password link for a user (administrators)
 *   POST  /functions/v1/merge_contacts   merge two contacts
 *   POST  /functions/v1/access_requests  approve or decline an account request (administrators)
 *   GET   /functions/v1/weekly_summary   preview of the weekly summary e-mail (administrators)
 *   POST  /functions/v1/weekly_summary   send the weekly summary now (administrators)
 *
 * Inbound email (postmark) and the MCP server are not ported.
 */
import { randomUUID } from "node:crypto";
import { pool, withTransaction, type Queryable } from "./db.ts";
import {
  AuthError,
  BAN_DURATION,
  createOneTimeLink,
  requireUser,
  revokeSessions,
  type AuthContext,
} from "./auth.ts";
import { HttpError, isEmail, publicOrigin, readJson, sendJson, type Req, type Res } from "./http.ts";
import { emailConfigured, env } from "./env.ts";
import { accessApprovedEmail, inviteEmail, recoveryEmail, sendMail } from "./mail.ts";
import { log } from "./log.ts";
import {
  buildWeeklySummary,
  lastSentSummary,
  nextSendTime,
  SCHEDULE,
  sendWeeklySummary,
  summaryRecipients,
} from "./weeklySummary.ts";

type Sale = {
  id: number;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  role: Role;
  pending_approval: boolean;
  disabled: boolean;
  secondary_emails: string[];
  avatar: unknown;
};

const ROLES = ["admin", "manager", "sales_rep"] as const;
type Role = (typeof ROLES)[number];

/** The role a form asks for: `role`, or the older `administrator` flag */
const requestedRole = (body: { role?: unknown; administrator?: unknown }): Role | undefined => {
  if (typeof body.role === "string" && (ROLES as readonly string[]).includes(body.role)) {
    return body.role as Role;
  }
  if (body.administrator === true) return "admin";
  return undefined;
};

/** Refuses to leave the CRM without an active administrator */
const keepAnAdministrator = async (db: Queryable, salesId: number) => {
  const { rows } = await db.query<{ count: number }>(
    "select count(*)::int as count from public.sales where administrator and not disabled and id <> $1",
    [salesId],
  );
  if (rows[0].count === 0) throw fail(400, "The CRM needs at least one active administrator");
};

const MAX_SECONDARY_EMAILS = 10;

const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  new HttpError(status, message, { status, message, ...extra });

const getSaleByUserId = async (db: Queryable, userId: string) =>
  (await db.query<Sale>("select * from public.sales where user_id = $1", [userId])).rows[0];

const getSaleById = async (db: Queryable, id: unknown) =>
  (await db.query<Sale>("select * from public.sales where id = $1", [Number(id)])).rows[0];

const requireSale = async (req: Req): Promise<AuthContext & { sale: Sale }> => {
  const context = await requireUser(req);
  const sale = await getSaleByUserId(pool, context.user.id);
  if (!sale) throw fail(401, "Unauthorized");
  return { ...context, sale };
};

/** Returns the first email already used by another user (main or secondary). */
const findEmailUsedByAnotherSale = async (emails: string[], excludeSalesId?: number) => {
  for (const email of emails) {
    const { rows } = await pool.query(
      `select 1 from public.sales
       where (email = $1::extensions.citext or secondary_emails @> jsonb_build_array($1::text))
         and ($2::bigint is null or id <> $2::bigint)
       limit 1`,
      [email, excludeSalesId ?? null],
    );
    if (rows.length > 0) return email;
    const users = await pool.query(
      `select 1 from auth.users u
       where u.email = $1::extensions.citext
         and ($2::bigint is null or not exists (select 1 from public.sales s where s.user_id = u.id and s.id = $2::bigint))`,
      [email, excludeSalesId ?? null],
    );
    if (users.rows.length > 0) return email;
  }
  return undefined;
};

const normalizeSecondaryEmails = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((email): email is string => typeof email === "string")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ]
    : undefined;

/**
 * The workspace a request is made in (X-Workspace-Id, sent by the app), or the
 * first workspace when the header is missing or names no workspace.
 */
const requestWorkspace = async (db: Queryable, req: Req): Promise<number> => {
  const requested = Number(req.headers["x-workspace-id"]);
  const { rows } = await db.query<{ id: number }>(
    `select coalesce(
       (select id from public.workspaces where id = $1),
       (select min(id) from public.workspaces)
     ) as id`,
    [Number.isSafeInteger(requested) ? requested : null],
  );
  return rows[0].id;
};

const inviteUser = async (req: Req, res: Res, current: Sale) => {
  const body = await readJson<{
    email?: string;
    first_name?: string;
    last_name?: string;
    disabled?: boolean;
    administrator?: boolean;
    role?: string;
  }>(req);
  if (!current.administrator) throw fail(401, "Not Authorized");
  // Least privilege by default: a sales rep sees their own clients and deals
  const role = requestedRole(body) ?? "sales_rep";

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) throw fail(400, "Invalid email address", { code: "invalid_email", email });
  const taken = await findEmailUsedByAnotherSale([email]);
  if (taken) {
    throw fail(409, `Email already used by another user: ${taken}`, { code: "email_taken", email: taken });
  }

  const userId = randomUUID();
  const sale = await withTransaction(async (db) => {
    // The invitation lets the sign-up trigger create this user's sales row.
    await db.query("insert into public.user_invitations (user_id) values ($1)", [userId]);
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data, invited_at)
       values ($1, $2, jsonb_strip_nulls(jsonb_build_object('first_name', $3::text, 'last_name', $4::text)), now())`,
      [userId, email, body.first_name?.trim() || null, body.last_name?.trim() || null],
    );
    if (body.disabled) {
      await db.query(
        `update auth.users set banned_until = now() + interval '${BAN_DURATION}' where id = $1`,
        [userId],
      );
    }
    const created = (
      await db.query<Sale>(
        "update public.sales set disabled = $2, role = $3 where user_id = $1 returning *",
        [userId, body.disabled === true, role],
      )
    ).rows[0];
    // The new user can open the workspace they were invited from; administrators
    // add them to others on the Workspaces page.
    await db.query(
      "insert into public.workspace_members (workspace_id, sales_id) values ($1, $2) on conflict do nothing",
      [await requestWorkspace(db, req), created.id],
    );
    return created;
  });

  const link = await createOneTimeLink(pool, req, userId, "invite");
  const emailSent = await sendMail(
    inviteEmail({ to: email, link, inviter: `${current.first_name} ${current.last_name}`.trim() }),
  );
  log.info(`User invited: ${email} (email ${emailSent ? "sent" : "not configured"})`);
  sendJson(res, 200, { data: sale, invite_link: link, email_sent: emailSent });
};

const patchUser = async (req: Req, res: Res, current: Sale) => {
  const body = await readJson<{
    sales_id?: number;
    email?: string;
    secondary_emails?: unknown;
    first_name?: string;
    last_name?: string;
    avatar?: unknown;
    administrator?: boolean;
    role?: string;
    disabled?: boolean;
  }>(req);
  const sale = await getSaleById(pool, body.sales_id);
  if (!sale) throw fail(404, "Not Found");
  // Users can only update their own profile unless they are an administrator.
  if (!current.administrator && current.id !== sale.id) throw fail(401, "Not Authorized");

  const email = body.email?.trim().toLowerCase();
  if (email && email !== sale.email.toLowerCase()) {
    if (!isEmail(email)) throw fail(400, "Invalid email address", { code: "invalid_email", email });
    const taken = await findEmailUsedByAnotherSale([email], sale.id);
    if (taken) {
      throw fail(409, `Email already used by another user: ${taken}`, { code: "email_taken", email: taken });
    }
  }

  let secondaryEmails: string[] | undefined;
  if (body.secondary_emails !== undefined) {
    secondaryEmails = normalizeSecondaryEmails(body.secondary_emails);
    if (!secondaryEmails) {
      throw fail(400, "secondary_emails must be an array", { code: "invalid_secondary_emails_payload" });
    }
    if (secondaryEmails.length > MAX_SECONDARY_EMAILS) {
      throw fail(400, `No more than ${MAX_SECONDARY_EMAILS} secondary emails are allowed`, {
        code: "too_many_secondary_emails",
      });
    }
    const invalid = secondaryEmails.find((item) => !isEmail(item));
    if (invalid) {
      throw fail(400, `Invalid secondary email: ${invalid}`, { code: "invalid_secondary_email", email: invalid });
    }
    const taken = await findEmailUsedByAnotherSale(secondaryEmails, sale.id);
    if (taken) {
      throw fail(409, `Secondary email already used by another user: ${taken}`, {
        code: "secondary_email_taken",
        email: taken,
      });
    }
  }

  const primary = (email ?? sale.email).toLowerCase();
  const effectiveSecondary = secondaryEmails ?? (Array.isArray(sale.secondary_emails) ? sale.secondary_emails : []);
  if (effectiveSecondary.includes(primary)) {
    throw fail(409, `Secondary email is already the main address: ${primary}`, {
      code: "secondary_email_is_primary",
      email: primary,
    });
  }

  const updated = await withTransaction(async (db) => {
    const ban = current.administrator && body.disabled !== undefined ? body.disabled === true : null;
    // The auth.users trigger copies first name, last name and email to sales.
    await db.query(
      `update auth.users set
         email = coalesce($2, email),
         raw_user_meta_data = raw_user_meta_data || jsonb_strip_nulls(jsonb_build_object('first_name', $3::text, 'last_name', $4::text)),
         banned_until = case when $5::boolean is null then banned_until when $5 then now() + interval '${BAN_DURATION}' else null end,
         updated_at = now()
       where id = $1`,
      [sale.user_id, email || null, body.first_name ?? null, body.last_name ?? null, ban],
    );
    if (body.avatar) {
      await db.query("update public.sales set avatar = $2::jsonb where user_id = $1", [
        sale.user_id,
        JSON.stringify(body.avatar),
      ]);
    }
    if (secondaryEmails) {
      await db.query("update public.sales set secondary_emails = $2::jsonb where user_id = $1", [
        sale.user_id,
        JSON.stringify(secondaryEmails),
      ]);
    }
    // Only administrators can change roles and the disabled flag.
    if (current.administrator) {
      const role =
        typeof body.role === "string"
          ? requestedRole(body)
          : body.administrator === undefined
            ? undefined
            : body.administrator
              ? "admin"
              : sale.role === "admin"
                ? "manager"
                : sale.role;
      if (body.role !== undefined && !role) throw fail(400, "Unknown role");
      if (sale.role === "admin" && ((role && role !== "admin") || body.disabled === true)) {
        await keepAnAdministrator(db, sale.id);
      }
      await db.query(
        "update public.sales set disabled = $2, role = coalesce($3, role) where user_id = $1",
        [sale.user_id, body.disabled === true, role ?? null],
      );
      if (body.disabled === true) await revokeSessions(db, sale.user_id);
    }
    return getSaleById(db, sale.id);
  });
  sendJson(res, 200, { data: updated });
};

/** Current user asks to change their password (Profile page). */
const updatePassword = async (req: Req, res: Res, context: AuthContext) => {
  const link = await createOneTimeLink(pool, req, context.user.id, "recovery");
  const emailSent = await sendMail(recoveryEmail({ to: context.user.email, link }));
  // Without email, the signed-in user goes straight to the link.
  sendJson(res, 200, { data: emailSent ? { email_sent: true } : { email_sent: false, link } });
};

/** Administrator creates a password link for a user who cannot sign in. */
const passwordLink = async (req: Req, res: Res, current: Sale) => {
  const body = await readJson<{ sales_id?: number; send_email?: boolean }>(req);
  const sale = await getSaleById(pool, body.sales_id);
  if (!sale) throw fail(404, "Not Found");
  if (!current.administrator && current.id !== sale.id) throw fail(401, "Not Authorized");
  const { rows } = await pool.query<{ email_confirmed_at: Date | null; encrypted_password: string | null }>(
    "select email_confirmed_at, encrypted_password from auth.users where id = $1",
    [sale.user_id],
  );
  // Users who never chose a password get a fresh invitation instead.
  const type = rows[0]?.encrypted_password ? "recovery" : "invite";
  const link = await createOneTimeLink(pool, req, sale.user_id, type);
  const emailSent =
    body.send_email === true
      ? await sendMail(
          type === "invite"
            ? inviteEmail({ to: sale.email, link, inviter: `${current.first_name} ${current.last_name}`.trim() })
            : recoveryEmail({ to: sale.email, link }),
        )
      : false;
  sendJson(res, 200, { data: { link, type, email_sent: emailSent } });
};

const mergeContacts = async (req: Req, res: Res, context: AuthContext) => {
  const body = await readJson<{ loserId?: number; winnerId?: number }>(req);
  const loserId = Number(body.loserId);
  const winnerId = Number(body.winnerId);
  if (!Number.isInteger(loserId) || !Number.isInteger(winnerId) || loserId === winnerId) {
    throw fail(400, "Missing loserId or winnerId");
  }
  // merge_contacts runs with the server's rights (no row level security):
  // both contacts must be in one workspace this user may open.
  const { rows } = await pool.query<{ workspace_id: number; sales_id: number | null }>(
    "select workspace_id, sales_id from public.contacts where id = any($1::bigint[])",
    [[loserId, winnerId]],
  );
  if (rows.length !== 2 || rows[0].workspace_id !== rows[1].workspace_id) {
    throw fail(400, "Both contacts must exist in the same workspace");
  }
  const current = await getSaleByUserId(pool, context.user.id);
  if (current?.role === "sales_rep" && rows.some((row) => row.sales_id !== current.id)) {
    throw fail(403, "Sales reps can only merge their own contacts");
  }
  const access = await pool.query<{ allowed: boolean }>(
    "select public.user_can_access_workspace($1, $2) as allowed",
    [rows[0].workspace_id, context.user.id],
  );
  if (!access.rows[0]?.allowed) throw fail(403, "Not allowed in this workspace");
  try {
    await pool.query("select public.merge_contacts($1::bigint, $2::bigint)", [loserId, winnerId]);
  } catch (error) {
    throw fail(500, `Failed to merge contacts: ${(error as Error).message}`);
  }
  sendJson(res, 200, { success: true, winnerId });
};

/** An administrator approves an account request (with its role and workspaces) or declines it */
const accessRequest = async (req: Req, res: Res, current: Sale) => {
  if (!current.administrator) throw fail(401, "Not Authorized");
  const body = await readJson<{
    sales_id?: number;
    action?: "approve" | "decline";
    role?: string;
    workspace_ids?: number[];
  }>(req);
  const sale = await getSaleById(pool, body.sales_id);
  if (!sale || !sale.pending_approval) throw fail(404, "No pending request for this user");

  if (body.action === "decline") {
    await withTransaction(async (db) => {
      await db.query("delete from public.sales where id = $1", [sale.id]);
      await db.query("delete from auth.users where id = $1", [sale.user_id]);
    });
    log.info(`Account request declined: ${sale.email}`);
    sendJson(res, 200, { data: { declined: true } });
    return;
  }
  if (body.action !== "approve") throw fail(400, "action must be approve or decline");

  const role = requestedRole(body) ?? "sales_rep";
  const workspaceIds = (Array.isArray(body.workspace_ids) ? body.workspace_ids : [])
    .map(Number)
    .filter(Number.isSafeInteger);
  if (role !== "admin" && workspaceIds.length === 0) {
    throw fail(400, "Choose at least one workspace", { code: "workspace_required" });
  }
  const approved = await withTransaction(async (db) => {
    await db.query(
      "update public.sales set pending_approval = false, disabled = false, role = $2 where id = $1",
      [sale.id, role],
    );
    await db.query("update auth.users set banned_until = null, updated_at = now() where id = $1", [sale.user_id]);
    await db.query(
      `insert into public.workspace_members (workspace_id, sales_id)
       select w.id, $1 from public.workspaces w where w.id = any($2::bigint[])
       on conflict do nothing`,
      [sale.id, workspaceIds],
    );
    return getSaleById(db, sale.id);
  });
  const emailSent = await sendMail(
    accessApprovedEmail({ to: sale.email, link: env.appUrl || publicOrigin(req) }),
  );
  log.info(`Account request approved: ${sale.email} (${role})`);
  sendJson(res, 200, { data: approved, email_sent: emailSent });
};

/** Preview (GET) or send now (POST) the weekly summary e-mail */
const weeklySummary = async (req: Req, res: Res, current: Sale) => {
  if (!current.administrator) throw fail(401, "Not Authorized");
  if (req.method === "GET") {
    const summary = await buildWeeklySummary();
    sendJson(res, 200, {
      data: {
        subject: summary.subject,
        html: summary.html,
        recipients: await summaryRecipients(),
        email_configured: emailConfigured(),
        schedule: SCHEDULE,
        next_send: nextSendTime().toISOString(),
        last_sent: await lastSentSummary(),
      },
    });
    return;
  }
  const body = await readJson<{ to_me?: boolean }>(req);
  const result = await sendWeeklySummary(body.to_me ? [current.email] : undefined);
  sendJson(res, 200, {
    data: { sent: result.sent, recipients: result.recipients, email_configured: emailConfigured() },
  });
};

export const handleFunctions = async (req: Req, res: Res, url: URL) => {
  const name = url.pathname.slice("/functions/v1/".length).replace(/\/$/, "");
  const method = req.method ?? "GET";
  try {
    if (name === "users" && (method === "POST" || method === "PATCH")) {
      const { sale } = await requireSale(req);
      return method === "POST" ? await inviteUser(req, res, sale) : await patchUser(req, res, sale);
    }
    if (name === "update_password" && method === "PATCH") {
      const context = await requireSale(req);
      return await updatePassword(req, res, context);
    }
    if (name === "password_link" && method === "POST") {
      const { sale } = await requireSale(req);
      return await passwordLink(req, res, sale);
    }
    if (name === "access_requests" && method === "POST") {
      const { sale } = await requireSale(req);
      return await accessRequest(req, res, sale);
    }
    if (name === "weekly_summary" && (method === "GET" || method === "POST")) {
      const { sale } = await requireSale(req);
      return await weeklySummary(req, res, sale);
    }
    if (name === "merge_contacts" && method === "POST") {
      const context = await requireSale(req);
      return await mergeContacts(req, res, context);
    }
    throw fail(404, "Function not found");
  } catch (error) {
    if (error instanceof AuthError) {
      return sendJson(res, 401, { status: 401, message: error.message, code: error.body.code });
    }
    if (error instanceof HttpError) {
      return sendJson(res, error.status, { status: error.status, message: error.message, ...error.body });
    }
    log.error(`Function error on ${method} ${name}`, error);
    return sendJson(res, 500, { status: 500, message: "Internal Server Error" });
  }
};
