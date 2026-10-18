import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { seedDatabase } from "./seed-core";

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "zp.db");
}

function openDatabase() {
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  // Apply pending migrations on open (idempotent) so a fresh deploy needs no separate step,
  // then seed the roster when the database is empty unless SEED_ON_EMPTY=0.
  if (process.env.AUTO_MIGRATE !== "0") {
    migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    if (process.env.SEED_ON_EMPTY !== "0") {
      const row = db.get<{ n: number }>(sql`select count(*) as n from members`);
      if (!row || row.n === 0) {
        const result = seedDatabase(db, {});
        if (result.seeded) console.log(`[zp] Seeded empty database at ${file}. ${result.message}`);
      }
    }
  }
  return db;
}

type Db = ReturnType<typeof openDatabase>;

const globalForDb = globalThis as unknown as { __zpDb?: Db };

/** Shared Drizzle instance (kept on globalThis so Next.js hot reload reuses the connection). */
export const db: Db = globalForDb.__zpDb ?? (globalForDb.__zpDb = openDatabase());

export { schema };
