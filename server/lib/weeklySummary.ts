/**
 * Weekly summary e-mail.
 *
 * Every Monday at 08:00 (Africa/Lagos unless WEEKLY_SUMMARY_TIMEZONE says
 * otherwise) the administrators receive what happened in each workspace over
 * the past seven days. A row per week in hdh_meta.weekly_summaries keeps a
 * restart, or a second replica, from sending the same week twice.
 *
 * Recipients: WEEKLY_SUMMARY_TO (comma-separated), else ADMIN_EMAIL, else every
 * administrator. WEEKLY_SUMMARY=off turns it off. It needs SMTP (SMTP_HOST…).
 */
import { pool } from "./db.ts";
import { emailConfigured, env } from "./env.ts";
import { escapeHtml } from "./http.ts";
import { log } from "./log.ts";
import { sendMail } from "./mail.ts";

export const TIME_ZONE = process.env.WEEKLY_SUMMARY_TIMEZONE || "Africa/Lagos";
const SEND_HOUR = 8;
const DISABLED = /^(0|false|off|no)$/i.test(process.env.WEEKLY_SUMMARY ?? "");
/** A server that was down at 08:00 still sends that morning, not days later */
const GRACE_MS = 24 * 60 * 60 * 1000;

export const SCHEDULE = `Mondays at 0${SEND_HOUR}:00 (${TIME_ZONE})`;

// --- Time ------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const zonedParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
};

/** The instant at which the clock in TIME_ZONE shows this date and time */
const zonedTime = (year: number, month: number, day: number, hour: number) => {
  const guess = Date.UTC(year, month - 1, day, hour);
  const shown = zonedParts(new Date(guess));
  const offset = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute) - guess;
  return new Date(guess - offset);
};

/** Monday 08:00 of the week `weeksBack` weeks before the local week of `now` */
const mondayAt = (now: Date, weeksBack: number) => {
  const local = zonedParts(now);
  const date = new Date(
    Date.UTC(local.year, local.month - 1, local.day - WEEKDAYS.indexOf(local.weekday) - 7 * weeksBack),
  );
  return zonedTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), SEND_HOUR);
};

export type Period = { start: Date; end: Date; week: string };

/** The last seven days reported by the latest Monday 08:00 at or before `now` */
export const lastPeriod = (now = new Date()): Period => {
  let weeksBack = 0;
  let end = mondayAt(now, weeksBack);
  if (end > now) end = mondayAt(now, ++weeksBack);
  const start = mondayAt(now, weeksBack + 1);
  const local = zonedParts(end);
  const week = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  return { start, end, week };
};

/** When the next summary goes out */
export const nextSendTime = (now = new Date()) => {
  const thisWeek = mondayAt(now, 0);
  return thisWeek > now ? thisWeek : mondayAt(new Date(now.getTime() + 7 * 24 * 3600 * 1000), 0);
};

// --- Data ------------------------------------------------------------------

type Stage = { value: string; label: string };

type WorkspaceSummary = {
  id: number;
  name: string;
  new_contacts: number;
  new_companies: number;
  new_deals: number;
  new_deals_amount: number;
  won_deals: number;
  won_amount: number;
  lost_deals: number;
  open_deals: number;
  open_amount: number;
  notes: number;
  tasks_done: number;
  tasks_overdue: number;
  top_deals: { name: string; company: string | null; stage: string; amount: number | null }[];
  team: { name: string; notes: number; deals: number }[];
};

const DEFAULT_STAGES: Stage[] = [
  { value: "opportunity", label: "Opportunity" },
  { value: "proposal-sent", label: "Proposal Sent" },
  { value: "in-negociation", label: "In Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "delayed", label: "Delayed" },
];

const loadSettings = async () => {
  const { rows } = await pool.query<{ config: Record<string, unknown> }>(
    "select config from public.configuration where id = 1",
  );
  const config = rows[0]?.config ?? {};
  const stages = Array.isArray(config.dealStages) ? (config.dealStages as Stage[]) : DEFAULT_STAGES;
  const won = Array.isArray(config.dealPipelineStatuses) ? (config.dealPipelineStatuses as string[]) : ["won"];
  const currency = typeof config.currency === "string" ? config.currency : "USD";
  const title = typeof config.title === "string" && config.title ? config.title : env.appName;
  return { stages, won, currency, title };
};

/**
 * When a won deal was won (same rule as the dashboard): its expected closing
 * date, unless it was last updated before that date.
 */
const WON_AT = "least(coalesce(d.expected_closing_date, d.updated_at), d.updated_at)";

const loadWorkspaces = async (period: Period, won: string[]): Promise<WorkspaceSummary[]> => {
  const range = [period.start, period.end, won];
  const { rows } = await pool.query<Omit<WorkspaceSummary, "top_deals" | "team">>(
    `select w.id, w.name,
       (select count(*)::int from public.contacts c where c.workspace_id = w.id and c.first_seen >= $1 and c.first_seen < $2) as new_contacts,
       (select count(*)::int from public.companies c where c.workspace_id = w.id and c.created_at >= $1 and c.created_at < $2) as new_companies,
       (select count(*)::int from public.deals d where d.workspace_id = w.id and d.created_at >= $1 and d.created_at < $2) as new_deals,
       (select coalesce(sum(d.amount), 0)::float8 from public.deals d where d.workspace_id = w.id and d.created_at >= $1 and d.created_at < $2) as new_deals_amount,
       (select count(*)::int from public.deals d where d.workspace_id = w.id and d.stage = any($3) and ${WON_AT} >= $1 and ${WON_AT} < $2) as won_deals,
       (select coalesce(sum(d.amount), 0)::float8 from public.deals d where d.workspace_id = w.id and d.stage = any($3) and ${WON_AT} >= $1 and ${WON_AT} < $2) as won_amount,
       (select count(*)::int from public.deals d where d.workspace_id = w.id and d.stage = 'lost' and d.updated_at >= $1 and d.updated_at < $2) as lost_deals,
       (select count(*)::int from public.deals d where d.workspace_id = w.id and d.archived_at is null and not (d.stage = any($3)) and d.stage <> 'lost') as open_deals,
       (select coalesce(sum(d.amount), 0)::float8 from public.deals d where d.workspace_id = w.id and d.archived_at is null and not (d.stage = any($3)) and d.stage <> 'lost') as open_amount,
       (select count(*)::int from public.contact_notes n where n.workspace_id = w.id and n.date >= $1 and n.date < $2)
         + (select count(*)::int from public.deal_notes n where n.workspace_id = w.id and n.date >= $1 and n.date < $2) as notes,
       (select count(*)::int from public.tasks t where t.workspace_id = w.id and t.done_date >= $1 and t.done_date < $2) as tasks_done,
       (select count(*)::int from public.tasks t where t.workspace_id = w.id and t.done_date is null and t.due_date < $2) as tasks_overdue
     from public.workspaces w
     order by w.id`,
    range,
  );
  const summaries: WorkspaceSummary[] = [];
  for (const row of rows) {
    const topDeals = await pool.query<WorkspaceSummary["top_deals"][number]>(
      `select d.name, c.name as company, d.stage, d.amount::float8 as amount
       from public.deals d left join public.companies c on c.id = d.company_id
       where d.workspace_id = $1 and d.archived_at is null and not (d.stage = any($2)) and d.stage <> 'lost'
       order by d.amount desc nulls last, d.id desc
       limit 5`,
      [row.id, won],
    );
    const team = await pool.query<WorkspaceSummary["team"][number]>(
      `select trim(s.first_name || ' ' || s.last_name) as name,
              (select count(*)::int from public.contact_notes n where n.sales_id = s.id and n.workspace_id = $1 and n.date >= $2 and n.date < $3)
                + (select count(*)::int from public.deal_notes n where n.sales_id = s.id and n.workspace_id = $1 and n.date >= $2 and n.date < $3) as notes,
              (select count(*)::int from public.deals d where d.sales_id = s.id and d.workspace_id = $1 and d.created_at >= $2 and d.created_at < $3) as deals
       from public.sales s
       where not s.disabled and not s.pending_approval
       order by 2 desc, 3 desc, 1`,
      [row.id, period.start, period.end],
    );
    summaries.push({
      ...row,
      top_deals: topDeals.rows,
      team: team.rows.filter((member) => member.notes + member.deals > 0).slice(0, 6),
    });
  }
  return summaries;
};

// --- Rendering ---------------------------------------------------------------

const INK = "#111114";
const IVORY = "#F7F5F0";
const GOLD = "#C6A15B";
const MUTED = "#6b6b70";

export type WeeklySummary = { subject: string; html: string; text: string; period: Period };

export const buildWeeklySummary = async (period = lastPeriod()): Promise<WeeklySummary> => {
  const settings = await loadSettings();
  const workspaces = await loadWorkspaces(period, settings.won);
  const money = (value: number | null) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: settings.currency,
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  const stageLabel = (value: string) =>
    settings.stages.find((stage) => stage.value === value)?.label ?? value;
  const day = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short" }).format(date);
  // The week runs Monday to Sunday (the summary goes out on Monday morning)
  const lastDay = new Date(period.end.getTime() - 24 * 60 * 60 * 1000);
  const dates = `${day(period.start)} – ${day(lastDay)}`;
  const link = env.appUrl || "";

  const totals = workspaces.reduce(
    (sum, w) => ({
      won: sum.won + w.won_amount,
      wonCount: sum.wonCount + w.won_deals,
      newDeals: sum.newDeals + w.new_deals,
      contacts: sum.contacts + w.new_contacts,
    }),
    { won: 0, wonCount: 0, newDeals: 0, contacts: 0 },
  );
  const subject = `${settings.title} weekly summary · ${dates}: ${money(totals.won)} won, ${totals.newDeals} new deal${totals.newDeals === 1 ? "" : "s"}`;

  const tile = (label: string, value: string, detail = "") =>
    `<td width="25%" style="padding:6px"><div style="background:${IVORY};border:1px solid #ece6d8;border-radius:12px;padding:14px 12px">
       <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED}">${escapeHtml(label)}</div>
       <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${INK};margin-top:6px">${escapeHtml(value)}</div>
       ${detail ? `<div style="font-size:12px;color:${MUTED};margin-top:2px">${escapeHtml(detail)}</div>` : ""}
     </div></td>`;

  const section = (w: WorkspaceSummary) => {
    const deals = w.top_deals.length
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;border-collapse:collapse;margin-top:6px">
          ${w.top_deals
            .map(
              (deal) => `<tr>
                <td style="padding:8px 0;border-top:1px solid #f0ebe0">${escapeHtml(deal.name)}${deal.company ? `<span style="color:${MUTED}"> · ${escapeHtml(deal.company)}</span>` : ""}</td>
                <td style="padding:8px 0;border-top:1px solid #f0ebe0;color:${MUTED}">${escapeHtml(stageLabel(deal.stage))}</td>
                <td align="right" style="padding:8px 0;border-top:1px solid #f0ebe0;font-weight:600">${escapeHtml(money(deal.amount))}</td>
              </tr>`,
            )
            .join("")}
        </table>`
      : `<p style="font-size:13px;color:${MUTED};margin:6px 0 0">No open deals.</p>`;
    const team = w.team.length
      ? `<p style="font-size:13px;color:${INK};margin:14px 0 0"><strong>Team activity:</strong> ${w.team
          .map((m) => `${escapeHtml(m.name)} (${m.notes} note${m.notes === 1 ? "" : "s"}, ${m.deals} new deal${m.deals === 1 ? "" : "s"})`)
          .join(" · ")}</p>`
      : "";
    return `<tr><td style="padding:28px 26px 8px">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${INK}">${escapeHtml(w.name)}</div>
      <div style="width:28px;height:2px;background:${GOLD};margin:8px 0 12px"></div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        ${tile("Won", money(w.won_amount), `${w.won_deals} deal${w.won_deals === 1 ? "" : "s"}`)}
        ${tile("New deals", String(w.new_deals), money(w.new_deals_amount))}
        ${tile("Open pipeline", money(w.open_amount), `${w.open_deals} open`)}
        ${tile("New contacts", String(w.new_contacts), `${w.new_companies} new compan${w.new_companies === 1 ? "y" : "ies"}`)}
      </tr></table>
      <p style="font-size:13px;color:${MUTED};margin:12px 0 0">${w.notes} note${w.notes === 1 ? "" : "s"} written · ${w.tasks_done} task${w.tasks_done === 1 ? "" : "s"} done · ${w.tasks_overdue} overdue · ${w.lost_deals} deal${w.lost_deals === 1 ? "" : "s"} lost</p>
      <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};margin-top:18px">Biggest open deals</div>
      ${deals}
      ${team}
    </td></tr>`;
  };

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${IVORY};padding:28px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e9e4d8">
<tr><td style="background:${INK};padding:26px">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${IVORY}">${escapeHtml(settings.title)}</div>
  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-top:6px">Weekly summary · ${escapeHtml(dates)}</div>
  <div style="font-size:14px;color:#d8d3c7;margin-top:14px">${escapeHtml(money(totals.won))} won in ${totals.wonCount} deal${totals.wonCount === 1 ? "" : "s"} · ${totals.newDeals} new deal${totals.newDeals === 1 ? "" : "s"} · ${totals.contacts} new contact${totals.contacts === 1 ? "" : "s"}</div>
</td></tr>
${workspaces.map(section).join("")}
<tr><td style="padding:22px 26px 28px">
  ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:${INK};color:${IVORY};text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;border-bottom:2px solid ${GOLD}">Open ${escapeHtml(settings.title)}</a>` : ""}
  <p style="font-size:12px;color:${MUTED};line-height:1.6;margin:18px 0 0">Sent ${escapeHtml(SCHEDULE)}. Amounts in ${escapeHtml(settings.currency)}. "Won" counts the deals won during the week (by their closing date).</p>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${settings.title} weekly summary · ${dates}`,
    `${money(totals.won)} won in ${totals.wonCount} deals · ${totals.newDeals} new deals · ${totals.contacts} new contacts`,
    ...workspaces.map((w) =>
      [
        "",
        `== ${w.name}`,
        `Won: ${money(w.won_amount)} (${w.won_deals}) · New deals: ${w.new_deals} (${money(w.new_deals_amount)}) · Open pipeline: ${money(w.open_amount)} (${w.open_deals})`,
        `New contacts: ${w.new_contacts} · New companies: ${w.new_companies} · Notes: ${w.notes} · Tasks done: ${w.tasks_done} · Overdue: ${w.tasks_overdue}`,
        ...w.top_deals.map((d) => `- ${d.name}${d.company ? ` (${d.company})` : ""}: ${stageLabel(d.stage)}, ${money(d.amount)}`),
      ].join("\n"),
    ),
    "",
    link ? `Open the CRM: ${link}` : "",
  ].join("\n");

  return { subject, html, text, period };
};

// --- Sending -----------------------------------------------------------------

export const summaryRecipients = async (): Promise<string[]> => {
  const configured = (process.env.WEEKLY_SUMMARY_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  if (env.adminEmail) return [env.adminEmail];
  const { rows } = await pool.query<{ email: string }>(
    "select email from public.sales where administrator and not disabled order by id",
  );
  return rows.map((row) => row.email);
};

export const lastSentSummary = async () => {
  const { rows } = await pool.query<{ week: string; sent_at: Date; recipients: string }>(
    "select week, sent_at, recipients from hdh_meta.weekly_summaries order by sent_at desc limit 1",
  );
  return rows[0] ?? null;
};

/** Sends a summary now; returns the addresses it was sent to */
export const sendWeeklySummary = async (to?: string[]) => {
  const recipients = to ?? (await summaryRecipients());
  const summary = await buildWeeklySummary();
  const results = await Promise.all(
    recipients.map((address) =>
      sendMail({ to: address, subject: summary.subject, html: summary.html, text: summary.text }),
    ),
  );
  return { sent: results.some(Boolean), recipients, summary };
};

const sendIfDue = async () => {
  if (DISABLED || !emailConfigured()) return;
  const now = new Date();
  const period = lastPeriod(now);
  // Too late for this week's summary (the server was down): wait for the next
  if (now.getTime() - period.end.getTime() > GRACE_MS) return;
  const recipients = await summaryRecipients();
  if (!recipients.length) return;
  // Claim the week first: another replica, or a later check, sees it as sent
  const claimed = await pool.query(
    "insert into hdh_meta.weekly_summaries (week, recipients) values ($1, $2) on conflict do nothing returning week",
    [period.week, recipients.join(", ")],
  );
  if (!claimed.rowCount) return;
  const { sent } = await sendWeeklySummary(recipients);
  if (sent) {
    log.info(`Weekly summary for the week to ${period.week} sent to ${recipients.join(", ")}`);
  } else {
    // Retry at the next check
    await pool.query("delete from hdh_meta.weekly_summaries where week = $1", [period.week]);
  }
};

export const startWeeklySummaryScheduler = () => {
  if (DISABLED) {
    log.info("Weekly summary: turned off (WEEKLY_SUMMARY=off)");
    return;
  }
  log.info(
    emailConfigured()
      ? `Weekly summary: ${SCHEDULE}`
      : `Weekly summary: ${SCHEDULE}, once email is set up (BREVO_API_KEY or SMTP_HOST)`,
  );
  const check = () =>
    sendIfDue().catch((error) => log.error("Weekly summary failed", error));
  setTimeout(check, 60_000).unref();
  setInterval(check, 15 * 60_000).unref();
};
