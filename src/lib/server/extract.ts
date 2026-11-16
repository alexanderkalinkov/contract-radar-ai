import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { addDays } from "@/lib/engine";
import { DEMO_EXTRACTION, DEMO_RENEWAL_QUOTE, ExtractionSchema, type Extraction, type ExtractionResult } from "@/lib/extraction";

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
- document_kind: a renewal quote or proposal the vendor sent for the next term is "renewal_quote", even if it repeats contract terms. Its annual fee is the quoted renewal fee.
- price_escalators: list every clause that raises the price automatically (fixed annual uplift, CPI-linked increase, year-2/year-3 step-ups, renewal at then-current list price). The renewal-increase cap is not an escalator; it goes in uplift_cap_percent.
- Risks: at most 3 short, plain-English notes about clauses that could cost the customer money.`;

// The renewal terms, and separately what kind of document it is plus its automatic price increases.
const TermsSchema = ExtractionSchema.omit({ document_kind: true, price_escalators: true });
const PricingSchema = ExtractionSchema.pick({ document_kind: true, price_escalators: true });
const PRICING_ASK = "Say what kind of document this is, and list every clause that raises the price automatically.";

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
    // A file named like a quote gets the demo renewal quote, so price-hike tracking can be tried too.
    const data = /quote|proposal|renewal/i.test(fileName) ? DEMO_RENEWAL_QUOTE : DEMO_EXTRACTION;
    return { fileName, extractedAt: new Date().toISOString(), demo: true, data, noticeDeadline: noticeDeadline(data) };
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
    // Two requests in parallel, because one strict schema with every field is too big for the API's
    // structured-output grammar ("compiled grammar is too large"). The first reads the renewal terms,
    // the second classifies the document and lists automatic price increases.
    const call = <T extends z.ZodType>(schema: T, text: string, effort: "low" | "medium") =>
      // Server-side fallback: if the model declines, the API re-runs the request on a fallback model.
      client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        output_config: { effort, format: betaZodOutputFormat(schema) },
        messages: [{ role: "user", content: [document, { type: "text", text }] }],
      });
    const [terms, pricing] = await Promise.all([
      call(TermsSchema, ask, "medium"),
      call(PricingSchema, `${PRICING_ASK}${input.kind === "text" ? " Page numbers are unknown: return null for every page." : ""}`, "low").catch((e) => {
        console.error("price escalator extraction failed", e);
        return null;
      }),
    ]);

    if (terms.stop_reason === "refusal") return { error: "The model declined to read this document.", status: 422 };
    if (terms.stop_reason === "max_tokens" || !terms.parsed_output) {
      return { error: "Could not read structured terms from this contract. Try another file.", status: 502 };
    }
    // The second request only adds detail; if it fails the contract is still saved, as a plain contract.
    const extra = pricing?.parsed_output ?? { document_kind: "contract" as const, price_escalators: [] };
    const data: Extraction = { ...terms.parsed_output, document_kind: extra.document_kind, price_escalators: extra.price_escalators };
    return {
      fileName,
      extractedAt: new Date().toISOString(),
      demo: false,
      model: terms.model,
      data,
      noticeDeadline: noticeDeadline(data),
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
