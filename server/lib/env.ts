import path from "node:path";

const flag = (value: string | undefined) => value === "true" || value === "1";

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value != null && value !== "" && Number.isFinite(parsed)
    ? parsed
    : fallback;
};

const publicUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return "";
};

/** Server settings, all read from environment variables. */
export const env = {
  port: number(process.env.PORT, 8080),
  host: process.env.HOST || "0.0.0.0",

  /** Neon connection string (Dashboard > Connect). Required. */
  databaseUrl: process.env.DATABASE_URL ?? "",
  runMigrations: process.env.RUN_MIGRATIONS !== "false",

  /** Optional: when unset, a secret is generated once and kept in the database. */
  jwtSecret: process.env.JWT_SECRET || undefined,
  jwtExpirySeconds: number(process.env.JWT_EXPIRY, 3600),

  /** Public URL used in emailed links. Falls back to the request's host. */
  appUrl: publicUrl().replace(/\/+$/, ""),
  appName: process.env.APP_NAME || "HDH CRM",

  distDir: path.resolve(
    process.env.DIST_DIR || path.join(import.meta.dirname, "..", "..", "dist"),
  ),

  postgrestBin: process.env.POSTGREST_BIN || "postgrest",
  postgrestPort: number(process.env.POSTGREST_PORT, 3001),
  postgrestAdminPort: number(process.env.POSTGREST_ADMIN_PORT, 3002),
  postgrestPool: number(process.env.POSTGREST_POOL, 10),

  /**
   * The browser client needs an API key value. It is public and grants
   * nothing: access is decided by the user's session token.
   */
  publishableKey: "hdh-crm-public-key",

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: number(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    secure:
      process.env.SMTP_SECURE != null
        ? flag(process.env.SMTP_SECURE)
        : number(process.env.SMTP_PORT, 587) === 465,
  },

  inviteTtlHours: number(process.env.INVITE_TTL_HOURS, 168),
  recoveryTtlHours: number(process.env.RECOVERY_TTL_HOURS, 24),
  minPasswordLength: number(process.env.MIN_PASSWORD_LENGTH, 8),
  maxUploadBytes: number(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
  attachmentsBucket: process.env.ATTACHMENTS_BUCKET || "attachments",

  /** Comma-separated origins allowed to call the API from another site (local dev). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Exposes /auth/v1/admin/* to service_role tokens. Only for automated tests. */
  adminApi: flag(process.env.AUTH_ADMIN_API),
};

export const emailConfigured = () => env.smtp.host !== "";
