import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export function GET() {
  const row = db.get<{ n: number }>(sql`select count(*) as n from members`);
  return NextResponse.json({ ok: true, members: row?.n ?? 0 });
}
