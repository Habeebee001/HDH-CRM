import pg from "pg";
import { env } from "./env.ts";

/**
 * node-postgres treats sslmode=require as verify-full and warns about it.
 * Neon certificates are publicly trusted, so ask for verify-full explicitly.
 */
const normalizeConnectionString = (connectionString: string) => {
  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode && ["prefer", "require", "verify-ca"].includes(sslmode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    // libpq-only parameter, unknown to node-postgres.
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return connectionString;
  }
};

// Columns of type timestamptz come back as Date objects, bigint as strings
// (ids are bigint): return them as numbers, as PostgREST does in JSON.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

/**
 * Pool used by the server (auth, storage, admin functions). It connects as
 * the database owner, so it bypasses row level security: every query must
 * check permissions itself.
 */
export const pool = new pg.Pool({
  connectionString: normalizeConnectionString(env.databaseUrl),
  max: 5,
  // Release idle connections quickly so Neon can scale to zero.
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 30_000,
});

export type Queryable = Pick<pg.PoolClient, "query">;

export const withTransaction = async <T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
