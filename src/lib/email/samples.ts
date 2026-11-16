// Sample data for email previews and the "send me a sample" button.
import { addDays } from "@/lib/engine";
import type { AlertItem } from "./templates";

export function sampleAlertItems(today: string): AlertItem[] {
  return [
    {
      contractId: "salesforce",
      vendor: "Salesforce",
      agreement: "Sales Cloud Enterprise MSA",
      kind: "notice",
      date: addDays(today, 30),
      daysLeft: 30,
      bucket: 30,
      annualFee: 186000,
      currency: "USD",
      renewalTermMonths: 12,
      noticeDays: 60,
      upliftCapPct: 5,
      department: "Sales",
      priceChange: { source: "quote", previousFee: 186000, newFee: 202740, deltaAbs: 16740, deltaPct: 9, capPct: 5, overCap: 7440 },
      decision: { status: "pending", summary: "Renegotiate · saves $7,440/yr", by: "sam@northwind.example" },
    },
    {
      contractId: "monday",
      vendor: "monday.com",
      agreement: "Enterprise plan order form",
      kind: "renewal",
      date: addDays(today, 58),
      daysLeft: 58,
      bucket: 60,
      annualFee: 42000,
      currency: "USD",
      renewalTermMonths: 12,
      noticeDays: 30,
      upliftCapPct: null,
      department: "Operations",
      escalator: "Renews at the then-current list price",
      decision: { status: "needed", summary: null, by: null },
    },
    {
      contractId: "zoom",
      vendor: "Zoom",
      agreement: null,
      kind: "term_end",
      date: addDays(today, 88),
      daysLeft: 88,
      bucket: 90,
      annualFee: 18400,
      currency: "USD",
      renewalTermMonths: null,
      noticeDays: null,
      upliftCapPct: null,
      department: null,
    },
  ];
}
