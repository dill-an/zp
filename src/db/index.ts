import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

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
  return drizzle(sqlite, { schema });
}

type Db = ReturnType<typeof openDatabase>;

const globalForDb = globalThis as unknown as { __zpDb?: Db };

/** Shared Drizzle instance (kept on globalThis so Next.js hot reload reuses the connection). */
export const db: Db = globalForDb.__zpDb ?? (globalForDb.__zpDb = openDatabase());

export { schema };
