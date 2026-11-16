import { NextResponse } from "next/server";
import type { ExtractionResult } from "@/lib/extraction";
import { extractionColumns, rowToSaved, type ContractRow, type SavedContract } from "@/lib/saved";
import { CONTRACTS_BUCKET, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { limitReason } from "@/lib/server/billing";
import { extractContract, isExtractError, isPdf, MAX_CONTRACT_BYTES as MAX_BYTES } from "@/lib/server/extract";
import { getSession } from "@/lib/server/workspace";
import { canWrite } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 120;

async function extract(fileName: string, bytes: Buffer): Promise<ExtractionResult | NextResponse> {
  const r = await extractContract(fileName, { kind: "pdf", bytes });
  return isExtractError(r) ? NextResponse.json({ error: r.error }, { status: r.status }) : r;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const session = isSupabaseConfigured ? await getSession() : null;
  if (isSupabaseConfigured && !session) {
    return NextResponse.json({ error: "Sign in to upload contracts." }, { status: 401 });
  }
  if (session && !canWrite(session.role)) {
    return NextResponse.json({ error: "You have read-only access to this workspace, so you can't upload contracts." }, { status: 403 });
  }
  return session ? extractFromStorage(req, session) : extractFromForm(req);
}

// Demo mode: the PDF comes in the request and the browser keeps the result.
async function extractFromForm(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a PDF in the 'file' field." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF contracts are supported in this version." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "PDF is larger than 20 MB." }, { status: 400 });
  }
  const result = await extract(file.name, Buffer.from(await file.arrayBuffer()));
  if (result instanceof NextResponse) return result;
  const saved: SavedContract = { ...result, id: `local-${crypto.randomUUID()}`, hasFile: false, uploadedByEmail: null };
  return NextResponse.json(saved);
}

// Signed in: the browser has already uploaded the PDF to <workspace_id>/<id>.pdf in the private bucket.
// Read it from there (as the user, so storage RLS applies), extract, and save the row under the same id.
async function extractFromStorage(req: Request, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; fileName?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const fileName = typeof body?.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : "contract.pdf";
  if (!UUID.test(id)) return NextResponse.json({ error: "Missing upload id." }, { status: 400 });

  const supabase = await createClient();
  const filePath = `${session.workspace.id}/${id}.pdf`;
  const discard = () => supabase.storage.from(CONTRACTS_BUCKET).remove([filePath]);

  const { count } = await supabase.from("contracts").select("id", { count: "exact", head: true }).eq("workspace_id", session.workspace.id).eq("demo", false);
  const overLimit = await limitReason(session.workspace.id, "contracts", count ?? 0);
  if (overLimit) {
    await discard();
    return NextResponse.json({ error: overLimit }, { status: 402 });
  }

  const { data: blob, error: dlError } = await supabase.storage.from(CONTRACTS_BUCKET).download(filePath);
  if (dlError || !blob) {
    return NextResponse.json({ error: "Could not find the uploaded PDF. Try uploading it again." }, { status: 400 });
  }
  if (blob.size > MAX_BYTES) {
    await discard();
    return NextResponse.json({ error: "PDF is larger than 20 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!isPdf(bytes)) {
    await discard();
    return NextResponse.json({ error: "That file isn't a PDF. Only PDF contracts are supported in this version." }, { status: 400 });
  }

  const result = await extract(fileName, bytes);
  if (result instanceof NextResponse) {
    await discard();
    return result;
  }

  const { data: row, error } = await supabase
    .from("contracts")
    .insert({
      id,
      workspace_id: session.workspace.id,
      uploaded_by_email: session.email,
      file_name: fileName,
      file_path: filePath,
      extraction: result.data,
      model: result.model ?? null,
      demo: result.demo,
      ...extractionColumns(result.data, result.noticeDeadline),
    })
    .select("*")
    .single();
  if (error || !row) {
    await discard();
    return NextResponse.json({ error: `Read the contract but could not save it: ${error?.message ?? "unknown error"}` }, { status: 500 });
  }
  return NextResponse.json(rowToSaved(row as ContractRow));
}
