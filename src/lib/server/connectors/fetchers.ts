import "server-only";
import type { SpendLine, UsageApp } from "@/lib/discovery/build";
import { isPlatformApp } from "@/lib/discovery/catalog";
import type { ProviderId } from "@/lib/discovery/types";
import { quickbooksApiBase } from "./config";

// Read-only calls to each provider. Every fetcher is capped so a sync fits in one serverless request.

export interface FetchResult {
  account_name: string | null;
  external_id?: string | null;
  spend?: SpendLine[];
  usage?: { apps: UsageApp[]; deptOf: Map<string, string>; windowDays: number; note?: string };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, token: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json", ...headers }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let code: string | undefined;
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      code = j?.error?.code ?? j?.Fault?.Error?.[0]?.code ?? j?.Type;
      msg = j?.error?.message ?? j?.Fault?.Error?.[0]?.Detail ?? j?.Detail ?? j?.Message ?? msg;
    } catch {
      // not JSON
    }
    throw new ProviderError(`${res.status} ${msg}`.trim(), res.status, code);
  }
  return (await res.json()) as T;
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// QuickBooks Online: Purchases (card, cash, cheque expenses) and Bills, last 13 months.
// ---------------------------------------------------------------------------

interface QbLine {
  Description?: string;
  AccountBasedExpenseLineDetail?: { AccountRef?: { name?: string } };
  ItemBasedExpenseLineDetail?: { ItemRef?: { name?: string } };
}
interface QbTxn {
  TxnDate: string;
  TotalAmt: number;
  EntityRef?: { name?: string };
  VendorRef?: { name?: string };
  CurrencyRef?: { value?: string };
  Line?: QbLine[];
  PrivateNote?: string;
}

export async function fetchQuickBooks(token: string, realmId: string): Promise<FetchResult> {
  const base = `${quickbooksApiBase()}/v3/company/${encodeURIComponent(realmId)}`;
  const q = async <T>(entity: string, where: string) => {
    const out: T[] = [];
    for (let page = 0; page < 5; page++) {
      const query = `select * from ${entity} where ${where} startposition ${page * 1000 + 1} maxresults 1000`;
      const json = await getJson<{ QueryResponse: Record<string, T[] | undefined> }>(
        `${base}/query?query=${encodeURIComponent(query)}&minorversion=75`,
        token,
      );
      const rows = json.QueryResponse?.[entity] ?? [];
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  };
  const since = ymd(daysAgo(395));
  const [info, purchases, bills] = await Promise.all([
    getJson<{ CompanyInfo?: { CompanyName?: string } }>(`${base}/companyinfo/${encodeURIComponent(realmId)}?minorversion=75`, token).catch(() => null),
    q<QbTxn>("Purchase", `TxnDate >= '${since}'`),
    q<QbTxn>("Bill", `TxnDate >= '${since}'`),
  ]);
  const hint = (t: QbTxn) =>
    [
      ...(t.Line ?? []).flatMap((l) => [l.AccountBasedExpenseLineDetail?.AccountRef?.name, l.ItemBasedExpenseLineDetail?.ItemRef?.name, l.Description]),
      t.PrivateNote,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 400);
  const toLine = (t: QbTxn, vendor?: string): SpendLine | null =>
    vendor ? { vendor, amount: Number(t.TotalAmt) || 0, date: t.TxnDate, hint: hint(t), currency: t.CurrencyRef?.value ?? null } : null;
  const spend = [...purchases.map((t) => toLine(t, t.EntityRef?.name)), ...bills.map((t) => toLine(t, t.VendorRef?.name))].filter(
    (x): x is SpendLine => Boolean(x),
  );
  return { account_name: info?.CompanyInfo?.CompanyName ?? null, external_id: realmId, spend };
}

// ---------------------------------------------------------------------------
// Xero: bills (ACCPAY invoices) and spend bank transactions, last 13 months.
// ---------------------------------------------------------------------------

interface XeroTxn {
  Contact?: { Name?: string };
  Total?: number;
  Date?: string;
  DateString?: string;
  Status?: string;
  CurrencyCode?: string;
  Reference?: string;
  LineItems?: { Description?: string; AccountCode?: string }[];
}

const xeroDate = (t: XeroTxn) => {
  if (t.DateString) return t.DateString.slice(0, 10);
  const m = /\/Date\((\d+)/.exec(t.Date ?? "");
  return m ? ymd(new Date(Number(m[1]))) : "";
};

export async function fetchXero(token: string, tenantId?: string | null): Promise<FetchResult> {
  const conns = await getJson<{ tenantId: string; tenantName: string; tenantType: string }[]>("https://api.xero.com/connections", token);
  const tenant = conns.find((c) => c.tenantId === tenantId) ?? conns.find((c) => c.tenantType === "ORGANISATION") ?? conns[0];
  if (!tenant) throw new ProviderError("No Xero organisation was shared with Contract Radar. Reconnect and pick one.", 400);
  const s = daysAgo(395);
  const dt = `DateTime(${s.getUTCFullYear()},${String(s.getUTCMonth() + 1).padStart(2, "0")},${String(s.getUTCDate()).padStart(2, "0")})`;
  const headers = { "xero-tenant-id": tenant.tenantId };
  const pages = async (path: string, key: "Invoices" | "BankTransactions", where: string) => {
    const out: XeroTxn[] = [];
    for (let page = 1; page <= 10; page++) {
      const json = await getJson<Record<string, XeroTxn[]>>(
        `https://api.xero.com/api.xro/2.0/${path}?where=${encodeURIComponent(where)}&page=${page}`,
        token,
        headers,
      );
      const rows = json[key] ?? [];
      out.push(...rows);
      if (rows.length < 100) break;
    }
    return out;
  };
  const [bills, bank] = await Promise.all([
    pages("Invoices", "Invoices", `Type=="ACCPAY" AND Date>=${dt}`),
    pages("BankTransactions", "BankTransactions", `Type=="SPEND" AND Date>=${dt}`),
  ]);
  const skip = new Set(["DELETED", "VOIDED", "DRAFT"]);
  const spend = [...bills, ...bank]
    .filter((t) => !skip.has(String(t.Status)) && t.Contact?.Name)
    .map((t) => ({
      vendor: t.Contact!.Name!,
      amount: Number(t.Total) || 0,
      date: xeroDate(t),
      hint: [t.Reference, ...(t.LineItems ?? []).map((l) => l.Description)].filter(Boolean).join(" | ").slice(0, 400),
      currency: t.CurrencyCode ?? null,
    }))
    .filter((l) => l.date);
  return { account_name: tenant.tenantName, external_id: tenant.tenantId, spend };
}

// ---------------------------------------------------------------------------
// Google Workspace: Directory (who works here, which department) + Reports API
// (third-party apps people signed in to with Google: OAuth tokens and SAML), last 90 days.
// ---------------------------------------------------------------------------

interface GUser {
  primaryEmail: string;
  suspended?: boolean;
  archived?: boolean;
  lastLoginTime?: string;
  orgUnitPath?: string;
  organizations?: { department?: string; primary?: boolean }[];
}
interface GActivity {
  id?: { time?: string };
  actor?: { email?: string };
  events?: { name?: string; parameters?: { name: string; value?: string }[] }[];
}

const WINDOW_GOOGLE = 90;

export async function fetchGoogle(token: string): Promise<FetchResult> {
  const users: GUser[] = [];
  let pageToken = "";
  for (let i = 0; i < 20; i++) {
    const u = new URL("https://admin.googleapis.com/admin/directory/v1/users");
    u.searchParams.set("customer", "my_customer");
    u.searchParams.set("maxResults", "500");
    u.searchParams.set("fields", "nextPageToken,users(primaryEmail,suspended,archived,lastLoginTime,orgUnitPath,organizations)");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const json = await getJson<{ users?: GUser[]; nextPageToken?: string }>(u.toString(), token);
    users.push(...(json.users ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  const deptOf = new Map<string, string>();
  for (const u of users) {
    const org = u.organizations?.find((o) => o.primary && o.department) ?? u.organizations?.find((o) => o.department);
    const ou = u.orgUnitPath && u.orgUnitPath !== "/" ? u.orgUnitPath.split("/").filter(Boolean).at(-1) : undefined;
    const d = org?.department ?? ou;
    if (d) deptOf.set(u.primaryEmail.toLowerCase(), d);
  }

  const start = daysAgo(WINDOW_GOOGLE).toISOString();
  const apps = new Map<string, Map<string, string>>(); // app → email → latest sign-in time
  const add = (name: string | undefined, email: string | undefined, time: string | undefined) => {
    if (!name || !email || isPlatformApp(name)) return;
    const key = name.trim();
    if (!apps.has(key)) apps.set(key, new Map());
    const people = apps.get(key)!;
    const e = email.toLowerCase();
    const t = time ?? start;
    if ((people.get(e) ?? "") < t) people.set(e, t);
  };
  const activities = async (application: "token" | "saml", onEvent: (a: GActivity, e: NonNullable<GActivity["events"]>[number]) => void) => {
    let pt = "";
    for (let i = 0; i < 10; i++) {
      const u = new URL(`https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/${application}`);
      u.searchParams.set("startTime", start);
      u.searchParams.set("maxResults", "1000");
      if (pt) u.searchParams.set("pageToken", pt);
      const json = await getJson<{ items?: GActivity[]; nextPageToken?: string }>(u.toString(), token);
      for (const a of json.items ?? []) for (const e of a.events ?? []) onEvent(a, e);
      if (!json.nextPageToken) break;
      pt = json.nextPageToken;
    }
  };
  const param = (e: NonNullable<GActivity["events"]>[number], n: string) => e.parameters?.find((p) => p.name === n)?.value;
  await activities("token", (a, e) => {
    if (e.name !== "revoke") add(param(e, "app_name"), a.actor?.email, a.id?.time);
  });
  // SAML is only logged when Google is the identity provider for an app; an empty or missing log is normal.
  await activities("saml", (a, e) => {
    if (e.name === "login_success") add(param(e, "application_name"), a.actor?.email, a.id?.time);
  }).catch(() => undefined);

  const active = users.filter((u) => !u.suspended && !u.archived);
  const cutoff = daysAgo(WINDOW_GOOGLE).toISOString();
  const recentUsers = active.filter((u) => u.lastLoginTime && u.lastLoginTime >= cutoff);
  const recent = new Set(recentUsers.map((u) => u.primaryEmail.toLowerCase()));
  const list: UsageApp[] = [...apps].map(([name, people]) => ({ name, users: new Set(people.keys()), last: people }));
  list.push({
    name: "Google Workspace",
    users: recent,
    licensed: active.length,
    note: `${recent.size} of ${active.length} active accounts signed in, last ${WINDOW_GOOGLE} days`,
    last: new Map(recentUsers.map((u) => [u.primaryEmail.toLowerCase(), u.lastLoginTime!])),
    neverIn: active.filter((u) => !recent.has(u.primaryEmail.toLowerCase())).map((u) => u.primaryEmail.toLowerCase()),
  });
  const domain = users[0]?.primaryEmail.split("@")[1] ?? null;
  return { account_name: domain, usage: { apps: list, deptOf, windowDays: WINDOW_GOOGLE } };
}

// ---------------------------------------------------------------------------
// Microsoft Entra ID: users and departments, M365 licences, and app sign-ins (last 30 days).
// Sign-in logs need Entra ID P1/P2; without it we fall back to who is assigned to each enterprise app.
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.microsoft.com/v1.0";
const WINDOW_MS = 30;

interface MsUser {
  id: string;
  userPrincipalName?: string;
  mail?: string;
  department?: string;
  accountEnabled?: boolean;
}
interface MsSku {
  skuPartNumber: string;
  capabilityStatus: string;
  consumedUnits: number;
  prepaidUnits?: { enabled?: number };
}

async function graphAll<T>(url: string, token: string, maxPages: number, headers: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  for (let i = 0; next && i < maxPages; i++) {
    const json: { value?: T[]; "@odata.nextLink"?: string } = await getJson(next, token, headers);
    out.push(...(json.value ?? []));
    next = json["@odata.nextLink"];
  }
  return out;
}

/** Licence SKUs that are their own product line rather than "Microsoft 365". Free and trial SKUs are skipped. */
const SKU_PRODUCT: [RegExp, string][] = [
  [/copilot/i, "Microsoft 365 Copilot"],
  [/^POWER_BI_PRO|^PBI_PREMIUM/i, "Power BI"],
  [/^VISIO/i, "Microsoft Visio"],
  [/^PROJECT/i, "Microsoft Project"],
  [/^DYN365|^DYNAMICS/i, "Microsoft Dynamics 365"],
];
const FREE_SKU = /FREE|TRIAL|EXPLORATORY|STANDARD_STUDENT|FLOW_FREE|POWER_BI_STANDARD|WINDOWS_STORE|RIGHTSMANAGEMENT_ADHOC|MCOPSTNC|CCIBOTS_PRIVPREV|POWERAPPS_DEV|STREAM|DEVELOPERPACK/i;
const MS_FIRST_PARTY = /^(microsoft|office|azure|windows|onedrive|sharepoint|outlook|teams|my (apps|profile|signins)|bing|skype|intune|exchange)\b/i;

export async function fetchMicrosoft(token: string): Promise<FetchResult> {
  const [orgs, users, skus] = await Promise.all([
    graphAll<{ id: string; displayName?: string }>(`${GRAPH}/organization?$select=id,displayName`, token, 1),
    graphAll<MsUser>(`${GRAPH}/users?$select=id,userPrincipalName,mail,department,accountEnabled&$top=999`, token, 10),
    graphAll<MsSku>(`${GRAPH}/subscribedSkus`, token, 1).catch(() => [] as MsSku[]),
  ]);
  const deptOf = new Map<string, string>();
  const idToEmail = new Map<string, string>();
  for (const u of users) {
    const email = (u.userPrincipalName ?? u.mail ?? "").toLowerCase();
    if (!email) continue;
    idToEmail.set(u.id, email);
    if (u.department) {
      deptOf.set(email, u.department);
      if (u.mail) deptOf.set(u.mail.toLowerCase(), u.department);
    }
  }

  const apps = new Map<string, Set<string>>();
  const lastSeen = new Map<string, Map<string, string>>(); // app → email → latest sign-in (sign-in logs only)
  const add = (name: string | undefined, email: string | undefined, time?: string) => {
    if (!name || !email || isPlatformApp(name) || MS_FIRST_PARTY.test(name)) return;
    if (!apps.has(name)) apps.set(name, new Set());
    const e = email.toLowerCase();
    apps.get(name)!.add(e);
    if (time) {
      if (!lastSeen.has(name)) lastSeen.set(name, new Map());
      const m = lastSeen.get(name)!;
      if ((m.get(e) ?? "") < time) m.set(e, time);
    }
  };

  let note: string | undefined;
  try {
    const since = daysAgo(WINDOW_MS).toISOString().replace(/\.\d+Z$/, "Z");
    const signIns = await graphAll<{ appDisplayName?: string; userPrincipalName?: string; createdDateTime?: string; status?: { errorCode?: number } }>(
      `${GRAPH}/auditLogs/signIns?$filter=${encodeURIComponent(`createdDateTime ge ${since}`)}&$top=1000`,
      token,
      15,
    );
    for (const s of signIns) if (!s.status?.errorCode) add(s.appDisplayName, s.userPrincipalName, s.createdDateTime ?? since);
  } catch (e) {
    if (!(e instanceof ProviderError) || (e.status !== 403 && e.status !== 400)) throw e;
    // No Entra ID P1/P2 (or no Reports Reader role): count who is assigned to each enterprise app instead.
    note = "Sign-in logs need Entra ID P1 or P2, so these counts are people assigned to each app, not people who signed in.";
    const sps = await graphAll<{ id: string; displayName: string }>(
      `${GRAPH}/servicePrincipals?$filter=${encodeURIComponent("tags/any(t:t eq 'WindowsAzureActiveDirectoryIntegratedApp')")}&$select=id,displayName&$top=999`,
      token,
      2,
    );
    for (const sp of sps.slice(0, 40)) {
      const assigned = await graphAll<{ principalType: string; principalId: string }>(
        `${GRAPH}/servicePrincipals/${sp.id}/appRoleAssignedTo?$select=principalType,principalId&$top=999`,
        token,
        2,
      ).catch(() => []);
      for (const a of assigned) if (a.principalType === "User") add(sp.displayName, idToEmail.get(a.principalId));
    }
  }

  const list: UsageApp[] = [...apps].map(([name, set]) => ({
    name,
    users: set,
    note: note ? `${set.size} ${set.size === 1 ? "person" : "people"} assigned in Entra ID` : undefined,
    last: note ? undefined : lastSeen.get(name),
  }));

  // Licences: what you pay Microsoft for, and how many are assigned.
  const products = new Map<string, { enabled: number; used: number; skus: string[] }>();
  for (const s of skus) {
    const enabled = s.prepaidUnits?.enabled ?? 0;
    if (s.capabilityStatus !== "Enabled" || enabled <= 0 || enabled >= 10_000 || FREE_SKU.test(s.skuPartNumber)) continue;
    const product = SKU_PRODUCT.find(([re]) => re.test(s.skuPartNumber))?.[1] ?? "Microsoft 365";
    const p = products.get(product) ?? { enabled: 0, used: 0, skus: [] };
    p.enabled += enabled;
    p.used += s.consumedUnits;
    p.skus.push(s.skuPartNumber);
    products.set(product, p);
  }
  for (const [name, p] of products) {
    list.push({
      name,
      users: new Set(),
      count: p.used,
      licensed: p.enabled,
      note: `${p.used} of ${p.enabled} licences assigned (${p.skus.slice(0, 3).join(", ")})`,
    });
  }
  return { account_name: orgs[0]?.displayName ?? null, external_id: orgs[0]?.id ?? null, usage: { apps: list, deptOf, windowDays: WINDOW_MS, note } };
}

export async function fetchProvider(provider: ProviderId, token: string, externalId: string | null): Promise<FetchResult> {
  switch (provider) {
    case "quickbooks":
      if (!externalId) throw new ProviderError("QuickBooks company ID is missing. Disconnect and connect again.", 400);
      return fetchQuickBooks(token, externalId);
    case "xero":
      return fetchXero(token, externalId);
    case "google":
      return fetchGoogle(token);
    case "microsoft":
      return fetchMicrosoft(token);
  }
}
