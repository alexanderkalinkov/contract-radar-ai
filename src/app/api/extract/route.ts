import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { addDays } from "@/lib/engine";
import { DEMO_EXTRACTION, ExtractionSchema, type Extraction, type ExtractionResult } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
const MAX_BYTES = 20 * 1024 * 1024;

const SYSTEM = `You read B2B SaaS contracts (MSAs, order forms, subscription agreements) for a finance team.
Extract the renewal terms that decide how much the customer will pay and by when they must act.
Rules:
- Only report what the document says. If a term is not in the document, return null for its value and quote, with "low" confidence.
- Quote the exact contract text that supports each value, and give its 1-based page number.
- Dates must be YYYY-MM-DD. If the term end is only given as a start date plus a length, compute it.
- "confidence" is high when the text states the value directly, medium when you had to interpret or combine clauses, low when it is a guess.
- Risks: at most 3 short, plain-English notes about clauses that could cost the customer money.`;

function deadline(d: Extraction): string | null {
  const end = d.term_end.value;
  const days = d.notice_period_days.value;
  if (!end || days == null || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return addDays(end, -days);
}

export async function POST(req: Request) {
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

  // No key configured: return sample results so the flow still works in a demo.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    await new Promise((r) => setTimeout(r, 1500));
    const result: ExtractionResult = {
      fileName: file.name,
      extractedAt: new Date().toISOString(),
      demo: true,
      data: DEMO_EXTRACTION,
      noticeDeadline: deadline(DEMO_EXTRACTION),
    };
    return NextResponse.json(result);
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
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
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: file.name },
            { type: "text", text: "Extract the renewal terms from this contract." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The model declined to read this document." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return NextResponse.json({ error: "Could not read structured terms from this contract. Try another file." }, { status: 502 });
    }

    const result: ExtractionResult = {
      fileName: file.name,
      extractedAt: new Date().toISOString(),
      demo: false,
      model: response.model,
      data: response.parsed_output,
      noticeDeadline: deadline(response.parsed_output),
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by the Claude API. Wait a minute and try again." }, { status: 429 });
    }
    if (err instanceof Anthropic.BadRequestError) {
      return NextResponse.json({ error: `The API could not process this file: ${err.message}` }, { status: 400 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${err.status ?? "network"}). Try again.` }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "Unexpected error while reading the contract." }, { status: 500 });
  }
}
