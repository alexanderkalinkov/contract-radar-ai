import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DEPT_GROUP_NAMES } from "@/lib/discovery/catalog";
import { CATEGORIES } from "@/lib/team/types";

const MODEL = "claude-opus-5-5";

export interface Classification {
  is_software: boolean;
  name: string;
  category: string;
  dept: string | null;
}

const Schema = z.object({
  vendors: z.array(
    z.object({
      id: z.number().int().describe("The id from the input list"),
      is_software: z
        .boolean()
        .describe("true only for software, SaaS, cloud or app subscriptions. false for rent, utilities, travel, food, hardware, contractors, banks, taxes, payroll"),
      name: z.string().describe("Clean product or company name, e.g. 'Slack' for 'SLACK T0123 DUBLIN'"),
      category: z.enum(CATEGORIES as [string, ...string[]]),
      department: z
        .enum(["Company-wide", ...DEPT_GROUP_NAMES] as [string, ...string[]])
        .nullable()
        .describe("The department that usually owns and pays for this tool at a mid-size company. Company-wide for tools everyone uses. null if unclear"),
    }),
  ),
});

export const canClassify = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * Asks Claude about vendor names the catalogue doesn't know. Returns null when no key is set or the call fails,
 * so a sync never breaks because of it. Only names, amounts and account labels are sent, never personal data.
 */
export async function classifyVendors(items: { name: string; context: string }[]): Promise<Map<string, Classification> | null> {
  if (!items.length || !canClassify()) return null;
  const batch = items.slice(0, 80);
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system:
        "You sort a company's vendors from its accounting system and sign-in logs. For each one, decide whether it is a software subscription, give its clean product name, a category and the department that usually owns it. Vendor names may be card descriptors with reference numbers.",
      output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
      messages: [
        {
          role: "user",
          content: batch.map((v, i) => `${i}. ${v.name}${v.context ? ` (${v.context})` : ""}`).join("\n"),
        },
      ],
    });
    const out = new Map<string, Classification>();
    for (const v of response.parsed_output?.vendors ?? []) {
      const src = batch[v.id];
      if (!src) continue;
      out.set(src.name, {
        is_software: v.is_software,
        name: v.name.slice(0, 120) || src.name,
        category: v.category,
        dept: v.department === "Company-wide" ? "IT & Security" : (v.department ?? null),
      });
    }
    return out;
  } catch (e) {
    console.error("Vendor classification failed", e);
    return null;
  }
}
