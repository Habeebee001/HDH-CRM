import nodemailer from "nodemailer";
import { emailTransport, env } from "./env.ts";
import { escapeHtml } from "./http.ts";
import { log } from "./log.ts";

const transporter =
  emailTransport() === "smtp"
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: env.smtp.user
          ? { user: env.smtp.user, pass: env.smtp.pass }
          : undefined,
        // Fail fast when the host blocks outgoing SMTP
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
      })
    : null;

type Mail = { to: string; subject: string; text: string; html: string };

/** The bare address of EMAIL_FROM / SMTP_FROM ("HDH CRM <a@b.com>" → "a@b.com") */
const senderAddress = () => env.emailFrom.replace(/^.*<|>.*$/g, "").trim();

/** Sends through Brevo's HTTPS API (works where SMTP ports are blocked) */
const sendWithBrevoApi = async (mail: Mail) => {
  const response = await fetch(env.brevo.apiUrl, {
    method: "POST",
    headers: {
      "api-key": env.brevo.apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: env.appName, email: senderAddress() },
      to: mail.to
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean)
        .map((email) => ({ email })),
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Brevo API answered ${response.status}: ${detail}`);
  }
};

/**
 * Sends an email when email is configured. Returns false (and logs the
 * message) otherwise, so callers can hand the link to an administrator.
 */
export const sendMail = async (mail: Mail): Promise<boolean> => {
  const transport = emailTransport();
  if (!transport) {
    log.info(`Email not sent (email not configured) to ${mail.to}: ${mail.subject}`);
    return false;
  }
  try {
    if (transport === "brevo-api") {
      await sendWithBrevoApi(mail);
    } else {
      await transporter!.sendMail({
        from: env.emailFrom ? `"${env.appName}" <${senderAddress()}>` : undefined,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    }
    log.info(`Email sent to ${mail.to}: ${mail.subject}`);
    return true;
  } catch (error) {
    log.error(`Failed to send email to ${mail.to}`, error);
    return false;
  }
};

// --- Branded templates (HDH Ink & Champagne) --------------------------------------

const INK = "#111114";
const IVORY = "#F7F5F0";
const GOLD = "#C6A15B";

const layout = (title: string, body: string, cta: { label: string; url: string }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${IVORY};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e9e4d8">
<tr><td style="background:${INK};padding:28px 32px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:.5px;color:${IVORY}">${escapeHtml(env.appName)}</div>
<div style="width:36px;height:2px;background:${GOLD};margin-top:12px"></div>
</td></tr>
<tr><td style="padding:32px">
<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
<p style="margin:28px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${INK};color:${IVORY};text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600;border-bottom:2px solid ${GOLD}">${escapeHtml(cta.label)}</a></p>
<p style="font-size:12px;color:#6b6b70;line-height:1.6;margin:0">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(cta.url)}</span></p>
</td></tr></table>
</td></tr></table></body></html>`;

const paragraph = (text: string) =>
  `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(text)}</p>`;

export const inviteEmail = ({
  to,
  link,
  inviter,
}: {
  to: string;
  link: string;
  inviter?: string;
}): Mail => {
  const intro = inviter
    ? `${inviter} has invited you to ${env.appName}.`
    : `You have been invited to ${env.appName}.`;
  const validity = `This link is valid for ${Math.round(env.inviteTtlHours / 24)} days and can be used once.`;
  return {
    to,
    subject: `You're invited to ${env.appName}`,
    text: `${intro}\n\nChoose your password to get started:\n${link}\n\n${validity}`,
    html: layout(
      "You're invited",
      paragraph(intro) +
        paragraph("Choose your password to get started.") +
        paragraph(validity),
      { label: "Accept invitation", url: link },
    ),
  };
};

export const recoveryEmail = ({ to, link }: { to: string; link: string }): Mail => {
  const validity = `This link is valid for ${env.recoveryTtlHours} hours and can be used once. If you did not ask for it, you can ignore this email.`;
  return {
    to,
    subject: `Reset your ${env.appName} password`,
    text: `Someone asked to reset the password of your ${env.appName} account.\n\nChoose a new password:\n${link}\n\n${validity}`,
    html: layout(
      "Reset your password",
      paragraph(`Someone asked to reset the password of your ${env.appName} account.`) +
        paragraph(validity),
      { label: "Choose a new password", url: link },
    ),
  };
};

/** To the administrators: someone asked for an account on the sign-in page. */
export const accessRequestEmail = ({
  to,
  name,
  email,
  link,
}: {
  to: string;
  name: string;
  email: string;
  link: string;
}): Mail => {
  const who = name ? `${name} (${email})` : email;
  return {
    to,
    subject: `New account request: ${name || email}`,
    text: `${who} asked for an account on ${env.appName}.\n\nApprove or decline the request, and choose their role and workspaces, on the Users page:\n${link}`,
    html: layout(
      "New account request",
      paragraph(`${who} asked for an account on ${env.appName}.`) +
        paragraph("Approve or decline the request, and choose their role and workspaces, on the Users page."),
      { label: "Review the request", url: link },
    ),
  };
};

/** To the person who asked: an administrator approved their account. */
export const accessApprovedEmail = ({ to, link }: { to: string; link: string }): Mail => ({
  to,
  subject: `Your ${env.appName} account is ready`,
  text: `An administrator approved your account on ${env.appName}. Sign in with the email address and password you chose:\n${link}`,
  html: layout(
    "Your account is ready",
    paragraph(`An administrator approved your account on ${env.appName}.`) +
      paragraph("Sign in with the email address and password you chose."),
    { label: "Sign in", url: link },
  ),
});

/** Standalone page shown by the server (e.g. before using a one-time link). */
export const page = ({
  title,
  message,
  form,
}: {
  title: string;
  message: string;
  form?: { action: string; fields: Record<string, string>; button: string };
}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} · ${escapeHtml(env.appName)}</title>
<link rel="icon" href="/favicon.ico">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${INK};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};padding:24px}
.card{background:${IVORY};border-radius:16px;max-width:440px;width:100%;padding:40px 36px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.logo{width:64px;height:auto;display:block;margin-bottom:20px}
.rule{width:36px;height:2px;background:${GOLD};margin:0 0 20px}
h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:26px;margin:0 0 10px}
p{line-height:1.6;margin:0 0 24px;color:#3b3b40}
button,a.btn{display:inline-block;width:100%;text-align:center;background:${INK};color:${IVORY};border:0;border-bottom:2px solid ${GOLD};border-radius:10px;padding:14px 18px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none}
button:hover,a.btn:hover{background:#000}
</style></head>
<body><main class="card">
<img class="logo" src="/logos/hdh_logo.svg" alt="">
<div class="rule"></div>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
${
  form
    ? `<form method="post" action="${escapeHtml(form.action)}">${Object.entries(
        form.fields,
      )
        .map(
          ([name, value]) =>
            `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
        )
        .join("")}<button type="submit">${escapeHtml(form.button)}</button></form>`
    : `<a class="btn" href="/">Go to ${escapeHtml(env.appName)}</a>`
}
</main></body></html>`;
