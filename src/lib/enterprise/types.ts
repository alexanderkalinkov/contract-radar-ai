// Entities (brands, subsidiaries, regions), cost centres, SSO and audit log shapes shared by client and server.

export interface Entity {
  id: string;
  name: string;
  code: string | null;
  currency: string;
  country: string | null;
}

export interface CostCentre {
  id: string;
  entity_id: string;
  code: string;
  name: string | null;
}

export interface EntitiesData {
  entities: Entity[];
  costCentres: CostCentre[];
  /** contract id → where it's booked */
  assignments: Record<string, { entity_id: string | null; cost_centre_id: string | null }>;
  /** entity id ("none" for unassigned) → total annual fee per currency */
  spend: Record<string, Record<string, number>>;
  canManage: boolean;
  canAssign: boolean;
}

export type EntityOp =
  | { op: "addEntity"; name: string; code?: string | null; currency: string; country?: string | null }
  | { op: "updateEntity"; id: string; name?: string; code?: string | null; currency?: string; country?: string | null }
  | { op: "deleteEntity"; id: string }
  | { op: "addCostCentre"; entity_id: string; code: string; name?: string | null }
  | { op: "deleteCostCentre"; id: string }
  | { op: "assignContract"; contract_id: string; entity_id: string | null; cost_centre_id: string | null };

export interface SsoConfig {
  id: string;
  domain: string;
  metadata_url: string | null;
  status: "requested" | "active" | "disabled";
  enforce: boolean;
  default_role: "approver" | "viewer" | "member";
  created_at: string;
  activated_at: string | null;
}

export interface SsoData {
  configs: SsoConfig[];
  /** What the customer's identity provider needs (from the Supabase project URL). */
  serviceProvider: { entityId: string; acsUrl: string; metadataUrl: string } | null;
  /** SSO_ENABLED=true in the environment: the Supabase plan has SAML switched on. */
  enabled: boolean;
}

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "BGN", "JPY", "INR", "SGD"];

/** Readable sentence for an audit action, e.g. "contract.created" → "Added contract". */
export function describeAction(action: string): string {
  const MAP: Record<string, string> = {
    "contract.created": "Added contract",
    "contract.updated": "Changed contract",
    "contract.deleted": "Deleted contract",
    "contract.file_opened": "Opened contract file",
    "member.joined": "Joined workspace",
    "member.removed": "Removed from workspace",
    "member.role_changed": "Changed role",
    "member.updated": "Changed member",
    "invite.sent": "Sent invite",
    "invite.accepted": "Accepted invite",
    "invite.cancelled": "Cancelled invite",
    "department.created": "Added department",
    "department.updated": "Renamed department",
    "department.deleted": "Deleted department",
    "tool.created": "Added tool",
    "tool.updated": "Changed tool",
    "tool.deleted": "Removed tool",
    "workspace.updated": "Changed workspace settings",
    "connection.created": "Connected source",
    "connection.deleted": "Disconnected source",
    "entity.created": "Added entity",
    "entity.updated": "Changed entity",
    "entity.deleted": "Deleted entity",
    "cost_centre.created": "Added cost centre",
    "cost_centre.updated": "Changed cost centre",
    "cost_centre.deleted": "Deleted cost centre",
    "sso.created": "Requested SSO",
    "sso.updated": "Changed SSO settings",
    "sso.status_changed": "SSO status changed",
    "sso.deleted": "Removed SSO",
    "auth.signed_in": "Signed in",
    "audit.exported": "Exported audit log",
    "renewal.recommended": "Recommended renewal decision",
    "renewal.revised": "Revised renewal recommendation",
    "renewal.approved": "Approved renewal decision",
    "renewal.rejected": "Sent renewal decision back",
    "renewal.reopened": "Reopened renewal decision",
  };
  return MAP[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
