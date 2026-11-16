// Workspace roles. Safe to import from client and server code.
// The database stores these exact values in workspace_members.role and workspace_invites.role
// (see supabase/migrations/20261116215000_roles.sql).

export type Role = "owner" | "approver" | "viewer" | "member";

export const ROLES: { value: Role; label: string; help: string }[] = [
  { value: "owner", label: "Admin", help: "Manages the team, billing, sources and settings, and approves renewals." },
  { value: "approver", label: "Approver", help: "Finance sign-off: sees everything, approves renewal decisions and gets every reminder." },
  { value: "member", label: "Department owner", help: "Looks after their own department's tools and answers its surveys." },
  { value: "viewer", label: "Viewer", help: "Read only: can look at everything but can't change anything." },
];

export const isRole = (v: unknown): v is Role => v === "owner" || v === "approver" || v === "viewer" || v === "member";

/** Same order as public.role_rank(): an invite can raise someone's role but never lower it. */
export const roleRank = (v: unknown): number => (v === "owner" ? 4 : v === "approver" ? 3 : v === "member" ? 2 : v === "viewer" ? 1 : 0);

/** Anything unknown (for example a value from before a migration) is treated as a department owner. */
export const parseRole = (v: unknown): Role => (isRole(v) ? v : "member");

export const roleLabel = (role: Role, departmentId?: string | null): string =>
  role === "member" ? (departmentId === null ? "Member" : "Department owner") : ROLES.find((r) => r.value === role)!.label;

export const isAdmin = (role: Role | undefined) => role === "owner";

/** Everyone except viewers can upload, edit and answer surveys. */
export const canWrite = (role: Role | undefined) => role !== undefined && role !== "viewer";

/** Same rule as public.can_approve_renewals() in the database. */
export const canApproveRenewals = (role: Role | undefined) => role === "owner" || role === "approver";

/** Admins invite anyone; others can invite department owners and viewers; viewers can't invite. */
export const canInviteRole = (inviter: Role | undefined, role: Role) =>
  inviter === "owner" || (canWrite(inviter) && (role === "member" || role === "viewer"));
