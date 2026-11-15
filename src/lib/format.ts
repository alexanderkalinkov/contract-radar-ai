import { parseISO } from "./engine";

export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const usdShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : usd(n);

export const shortDate = (iso: string) =>
  parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const longDate = (iso: string) =>
  parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const monthKey = (iso: string) =>
  parseISO(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function inDays(days: number): string {
  if (days < 0) return `${-days} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
