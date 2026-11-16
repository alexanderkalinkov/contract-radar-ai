import "server-only";
import { NextResponse } from "next/server";
import { denyViewer, requireSession } from "../api";
import { adminClient } from "../admin";
import type { SessionInfo } from "../workspace";
import { missingImportTables } from "./drives";

export type ImportCtx = { session: SessionInfo; db: NonNullable<ReturnType<typeof adminClient>> };

/** Signed-in member plus the service-role client the import tables are written with. */
export async function importContext(opts: { write?: boolean } = {}): Promise<ImportCtx | NextResponse> {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (opts.write) {
    const denied = denyViewer(ctx.session);
    if (denied) return denied;
  }
  const db = adminClient();
  if (!db) return NextResponse.json({ error: "Bulk import needs SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 500 });
  return { session: ctx.session, db };
}

export const importError = (e: unknown, status = 500) => NextResponse.json({ error: missingImportTables((e as Error).message) }, { status });
