/**
 * Local testing only: prints a service_role token for the e2e fixtures.
 *   DATABASE_URL=... node server/test/mint-service-key.ts
 */
import { signJwt } from "../lib/crypto.ts";
import { pool } from "../lib/db.ts";

const secret =
  process.env.JWT_SECRET ??
  (await pool.query("select value from auth.settings where key = 'jwt_secret'"))
    .rows[0]?.value;
await pool.end();
if (!secret) throw new Error("No JWT secret: start the server once first");
const now = Math.floor(Date.now() / 1000);
process.stdout.write(
  signJwt(
    { role: "service_role", iss: "hdh-crm", iat: now, exp: now + 86400 },
    secret,
  ),
);
