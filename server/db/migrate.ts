/**
 * Applies server/db/migrations/*.sql in order, once each, recording them in
 * hdh_meta.migrations. Runs automatically when the server starts; can also be
 * run by hand: DATABASE_URL=... node server/db/migrate.ts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "migrations");

export const runMigrations = async (pool: pg.Pool): Promise<string[]> => {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort();
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      await client.query("begin");
      try {
        // Serializes concurrent starts (e.g. two replicas during a deploy).
        await client.query(
          "select pg_advisory_xact_lock(hashtext('hdh-crm-migrations'))",
        );
        await client.query("create schema if not exists hdh_meta");
        await client.query(
          "create table if not exists hdh_meta.migrations (version text primary key, applied_at timestamp with time zone not null default now())",
        );
        const done = await client.query(
          "select 1 from hdh_meta.migrations where version = $1",
          [version],
        );
        if (done.rowCount) {
          await client.query("commit");
          continue;
        }
        await client.query(
          await readFile(path.join(MIGRATIONS_DIR, file), "utf8"),
        );
        await client.query(
          "insert into hdh_meta.migrations (version) values ($1)",
          [version],
        );
        await client.query("commit");
        applied.push(version);
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw new Error(
          `Migration ${file} failed: ${(error as Error).message}`,
          { cause: error },
        );
      }
    }
  } finally {
    client.release();
  }
  return applied;
};

if (import.meta.main) {
  const { pool } = await import("../lib/db.ts");
  const { log } = await import("../lib/log.ts");
  try {
    const applied = await runMigrations(pool);
    log.info(
      applied.length
        ? `Applied migrations: ${applied.join(", ")}`
        : "Database is up to date",
    );
  } catch (error) {
    log.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
