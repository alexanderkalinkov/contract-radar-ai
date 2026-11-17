import { NextResponse } from "next/server";
import { recordAppError, type AppErrorKind } from "@/lib/server/errors";
import { getSession } from "@/lib/server/workspace";

// Problems reported by the browser (see ErrorTrail): failed API calls, crashes and 404 pages.
// Anyone can report (404s happen signed out too), so input is clipped and rate limited.
export const runtime = "nodejs";

const recent = new Map<string, number[]>();
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;
function tooMany(key: string): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) return true;
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

const KINDS: AppErrorKind[] = ["api", "upload", "crash", "not_found"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !KINDS.includes(body.kind as AppErrorKind)) return NextResponse.json({ ok: false }, { status: 400 });
  const session = await getSession().catch(() => null);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooMany(session?.userId ?? `ip:${ip}`)) return NextResponse.json({ ok: false }, { status: 429 });

  const status = Number(body.status);
  const details = body.details && typeof body.details === "object" ? (body.details as Record<string, unknown>) : {};
  await recordAppError({
    kind: body.kind as AppErrorKind,
    message: str(body.message, 1000) ?? "Unknown error",
    status: Number.isFinite(status) && status > 0 ? status : null,
    page: str(body.page, 300),
    endpoint: str(body.endpoint, 300),
    userId: session?.userId ?? null,
    email: session?.email ?? null,
    workspaceId: session?.workspace.id ?? null,
    browser: str(body.browser, 400) ?? req.headers.get("user-agent"),
    details: JSON.stringify(details).length <= 4000 ? details : { truncated: JSON.stringify(details).slice(0, 4000) },
  });
  return NextResponse.json({ ok: true });
}
