import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { addDays } from "@/lib/engine";
import { DEMO_EXTRACTION, ExtractionSchema, type Extraction, type ExtractionResult } from "@/lib/extraction";

// Claude reads one contract and returns its renewal terms. Shared by uploads (/api/extract)
// and contracts emailed to a workspace inbox (/api/inbound/resend).

const MODEL = "claude-opus-5-5";
export const MAX_CONTRACT_BYTES = 20 * 1024 * 1024;

const SYSTEM = `You read B2B SaaS contracts (MSAs, order forms, subscription agreements) for a finance team.
Extract the renewal terms that decide how much the customer will pay and by when they must act.
Rules:
- Only report what the document says. If a term is not in the document, return null for its value and quote, with "low" confidence.
- Quote the exact contract text that supports each value, and give its 1-based page number.
- Dates must be YYYY-MM-DD. If the term end is only given as a start date plus a length, compute it.
- "confidence" is high when the text states the value directly, medium when you had to interpret or combine clauses, low when it is a guess.
- Risks: at most 3 short, plain-English notes about clauses that could cost the customer money.`;

export type ContractInput = { kind: "pdf"; bytes: Buffer } | { kind: "text"; text: string };
export type ExtractError = { error: string; status: number };

export const isExtractError = (r: ExtractionResult | ExtractError): r is ExtractError => "error" in r;

export function noticeDeadline(d: Extraction): string | null {
  const end = d.term_end.value;
  const days = d.notice_period_days.value;
  if (!end || days == null || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return addDays(end, -days);
}

export const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString("latin1") === "%PDF-";
/** .docx files are zip archives. */
export const isZip = (bytes: Buffer) => bytes.subarray(0, 4).toString("latin1") === "PK\u0003\u0004";

/** Plain text of a Word (.docx) file, or null when it can't be read. Page numbers are lost. */
export async function docxToText(bytes: Buffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    const text = value.replace(/\n{3,}/g, "\n\n").trim();
    return text.length >= 40 ? text : null;
  } catch {
    return null;
  }
}

export async function extractContract(fileName: string, input: ContractInput): Promise<ExtractionResult | ExtractError> {
  // No key configured: return sample results so the flow still works in a demo.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    await new Promise((r) => setTimeout(r, 1500));
    return { fileName, extractedAt: new Date().toISOString(), demo: true, data: DEMO_EXTRACTION, noticeDeadline: noticeDeadline(DEMO_EXTRACTION) };
  }

  const document =
    input.kind === "pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.bytes.toString("base64") }, title: fileName } as const)
      : ({ type: "document", source: { type: "text", media_type: "text/plain", data: input.text }, title: fileName } as const);
  const ask =
    input.kind === "pdf"
      ? "Extract the renewal terms from this contract."
      : "Extract the renewal terms from this contract. It was converted from a Word file, so page numbers are unknown: return null for every page.";

  const client = new Anthropic();
  try {
    // Server-side fallback: if the model declines, the API re-runs the request on a fallback model.
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
      messages: [{ role: "user", content: [document, { type: "text", text: ask }] }],
    });

    if (response.stop_reason === "refusal") return { error: "The model declined to read this document.", status: 422 };
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { error: "Could not read structured terms from this contract. Try another file.", status: 502 };
    }
    return {
      fileName,
      extractedAt: new Date().toISOString(),
      demo: false,
      model: response.model,
      data: response.parsed_output,
      noticeDeadline: noticeDeadline(response.parsed_output),
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", status: 500 };
    if (err instanceof Anthropic.RateLimitError) return { error: "Rate limited by the Claude API. Wait a minute and try again.", status: 429 };
    if (err instanceof Anthropic.BadRequestError) return { error: `The API could not process this file: ${err.message}`, status: 400 };
    if (err instanceof Anthropic.APIError) return { error: `Claude API error (${err.status ?? "network"}). Try again.`, status: 502 };
    console.error(err);
    return { error: "Unexpected error while reading the contract.", status: 500 };
  }
}
