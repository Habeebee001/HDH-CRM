/**
 * Replacements for Atomic CRM's Supabase edge functions, reachable at the
 * same URLs so the browser code keeps calling supabase.functions.invoke():
 *
 *   POST  /functions/v1/users            invite a user (administrators)
 *   PATCH /functions/v1/users            update a user / own profile
 *   PATCH /functions/v1/update_password  password link for the current user
 *   POST  /functions/v1/password_link    password link for a user (administrators)
 *   POST  /functions/v1/merge_contacts   merge two contacts
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
import { HttpError, isEmail, readJson, sendJson, type Req, type Res } from "./http.ts";
import { inviteEmail, recoveryEmail, sendMail } from "./mail.ts";
import { log } from "./log.ts";

type Sale = {
  id: number;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
  secondary_emails: string[];
  avatar: unknown;
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

const inviteUser = async (req: Req, res: Res, current: Sale) => {
  const body = await readJson<{
    email?: string;
    first_name?: string;
    last_name?: string;
    disabled?: boolean;
    administrator?: boolean;
  }>(req);
  if (!current.administrator) throw fail(401, "Not Authorized");

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
    return (
      await db.query<Sale>(
        "update public.sales set disabled = $2, administrator = $3 where user_id = $1 returning *",
        [userId, body.disabled === true, body.administrator === true],
      )
    ).rows[0];
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
    // Only administrators can change the administrator and disabled flags.
    if (current.administrator) {
      await db.query(
        "update public.sales set disabled = $2, administrator = coalesce($3, administrator) where user_id = $1",
        [sale.user_id, body.disabled === true, body.administrator ?? null],
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

const mergeContacts = async (req: Req, res: Res) => {
  const body = await readJson<{ loserId?: number; winnerId?: number }>(req);
  const loserId = Number(body.loserId);
  const winnerId = Number(body.winnerId);
  if (!Number.isInteger(loserId) || !Number.isInteger(winnerId) || loserId === winnerId) {
    throw fail(400, "Missing loserId or winnerId");
  }
  try {
    await pool.query("select public.merge_contacts($1::bigint, $2::bigint)", [loserId, winnerId]);
  } catch (error) {
    throw fail(500, `Failed to merge contacts: ${(error as Error).message}`);
  }
  sendJson(res, 200, { success: true, winnerId });
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
    if (name === "merge_contacts" && method === "POST") {
      await requireSale(req);
      return await mergeContacts(req, res);
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
