import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "@/lib/engine";
import { ExtractionSchema, type Extraction } from "@/lib/extraction";
import { TARGET_CAP_PCT, type EmailGoal } from "@/lib/opportunities";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { lockedReason } from "@/lib/server/billing";
import { getSession } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";

const Body = z.object({
  data: ExtractionSchema,
  noticeDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  goal: z.enum(["cap", "seats", "cancel", "review"]),
  tone: z.enum(["firm", "friendly"]),
  company: z.string().max(120).nullable().optional(),
  /** Sign-in facts from Google Workspace / Microsoft, for seat-cut emails. */
  seats: z
    .object({
      paid: z.number().int().min(0).max(1_000_000),
      active: z.number().int().min(0).max(1_000_000),
      target: z.number().int().min(0).max(1_000_000).nullable(),
      source: z.string().max(60),
      days: z.number().int().min(1).max(365),
    })
    .nullable()
    .optional(),
});

type SeatFacts = NonNullable<z.infer<typeof Body>["seats"]>;

const seatLine = (s: SeatFacts) =>
  `Seat usage (${s.source} sign-ins): ${s.active} of ${s.paid} paid seats were used in the last ${s.days} days.${
    s.target != null ? ` Seat count to ask for at renewal: ${s.target}.` : ""
  }`;

const EmailSchema = z.object({
  subject: z.string().describe("Email subject line, under 80 characters"),
  body: z.string().describe("Plain-text email body, greeting to sign-off, with blank lines between paragraphs"),
});

const GOALS: Record<EmailGoal, string> = {
  cap: `The contract renews automatically and does not limit price increases. Ask the vendor to agree in writing that the renewal price will rise by no more than ${TARGET_CAP_PCT}% (or stay flat), and to send renewal pricing before the notice deadline so there is time to decide.`,
  seats: "Tell the vendor the customer will reduce its seat count at renewal under the seat-reduction clause (or, if the contract has none, ask for it), and ask for a revised order form. If a seat count to ask for is given, use it and mention how many seats were actually used; otherwise leave the new seat number as [new seat count] for the customer to fill in.",
  cancel: "Give formal written notice of non-renewal under the notice clause, and ask the vendor to confirm in writing that the subscription will not auto-renew.",
  review: "Say the customer wants to review renewal pricing and terms before the notice deadline, and ask for the renewal quote and a call.",
};

const SYSTEM = `You write short renewal emails from a company's finance team to a SaaS vendor's account manager.
Rules:
- Use only the facts and quotes you are given. Never invent clause numbers, prices, dates or seat counts.
- When you rely on a contract term, quote it briefly in double quotes and name the document it comes from. Mention the page if known.
- If the notice deadline is known, ask for a reply by the reply-by date and mention the notice deadline. If it is unknown, ask for a prompt reply.
- Plain text only, no markdown. Under 200 words. Start with "Hi [Name]," and end with "Best regards," then "[Your name]" and the company name if given.
- Tone: "firm" is formal and points to the contract's obligations; "friendly" is warm and collaborative but still clear about the ask.`;

function facts(d: Extraction, noticeDeadline: string | null) {
  const term = (label: string, f: { value: unknown; quote: string | null; page: number | null }) =>
    f.value == null && !f.quote ? `${label}: not stated` : `${label}: ${f.value ?? "see quote"}${f.quote ? ` (quote${f.page ? `, page ${f.page}` : ""}: "${f.quote}")` : ""}`;
  return [
    `Vendor: ${d.vendor}`,
    `Customer: ${d.customer ?? "not stated"}`,
    `Document: ${d.agreement_name}`,
    term("Current term ends", d.term_end),
    term("Auto-renews", d.auto_renewal),
    term("Notice period (days)", d.notice_period_days),
    term("Renewal price-increase cap (%)", d.uplift_cap_percent),
    term("Seat reduction allowed at renewal (%)", d.seat_reduction_percent),
    term(`Annual fee (${d.currency ?? "currency not stated"})`, d.annual_fee),
    term("Seats", d.seats),
    `Notice deadline: ${noticeDeadline ?? "unknown"}`,
    `Reply-by date: ${noticeDeadline ? addDays(noticeDeadline, -5) : "unknown"}`,
  ].join("\n");
}

/** Used when no API key is configured, so the screen still works in a demo. */
function templateEmail(d: Extraction, noticeDeadline: string | null, goal: EmailGoal, company: string | null, seats: SeatFacts | null) {
  const replyBy = noticeDeadline ? addDays(noticeDeadline, -5) : null;
  const ask: Record<EmailGoal, string> = {
    cap: `Our ${d.agreement_name} renews automatically and doesn't limit renewal price increases. Before it renews, we'd like your written confirmation that the renewal price will rise by no more than ${TARGET_CAP_PCT}%, along with the renewal pricing.`,
    seats: seats
      ? `Only ${seats.active} of our ${seats.paid} seats were used in the last ${seats.days} days, so we'll be reducing our seat count at renewal of the ${d.agreement_name}. Please send a revised order form for ${seats.target ?? "[new seat count]"} seats.`
      : `We'll be reducing our seat count at renewal of the ${d.agreement_name}. Please send a revised order form for [new seat count] seats.`,
    cancel: `Please treat this email as our written notice of non-renewal of the ${d.agreement_name}, and confirm that the subscription will not auto-renew.`,
    review: `We'd like to review pricing and terms for the ${d.agreement_name} before it renews. Could you send the renewal quote and suggest a time to talk?`,
  };
  const when = replyBy ? `Please reply by ${replyBy}, ahead of our ${noticeDeadline} notice deadline.` : "Please reply at your earliest convenience.";
  return {
    subject: goal === "cancel" ? `Notice of non-renewal: ${d.agreement_name}` : `Renewal of ${d.agreement_name}`,
    body: `Hi [Name],\n\n${ask[goal]}\n\n${when}\n\nBest regards,\n[Your name]${company ? `\n${company}` : ""}`,
  };
}

export async function POST(req: Request) {
  const session = isSupabaseConfigured ? await getSession() : null;
  if (isSupabaseConfigured && !session) {
    return NextResponse.json({ error: "Sign in to draft emails." }, { status: 401 });
  }
  const locked = session ? await lockedReason(session.workspace.id) : null;
  if (locked) return NextResponse.json({ error: locked }, { status: 402 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing contract details for the email." }, { status: 400 });
  const { data, noticeDeadline, goal, tone } = parsed.data;
  const seats = goal === "seats" ? parsed.data.seats ?? null : null;
  const company = parsed.data.company ?? data.customer ?? null;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json({ ...templateEmail(data, noticeDeadline, goal, company, seats), demo: true });
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(EmailSchema) },
      messages: [
        {
          role: "user",
          content: `Contract facts:\n${facts(data, noticeDeadline)}${seats ? `\n${seatLine(seats)}` : ""}\n\nCompany name for the sign-off: ${company ?? "not given"}\nTone: ${tone}\n\nWhat the email must do: ${GOALS[goal]}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "Claude couldn't draft this email. Try a different goal or tone." }, { status: 502 });
    }
    return NextResponse.json({ ...response.parsed_output, demo: false });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by the Claude API. Wait a minute and try again." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error (${err.status ?? "network"}). Try again.` }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ error: "Unexpected error while drafting the email." }, { status: 500 });
  }
}
