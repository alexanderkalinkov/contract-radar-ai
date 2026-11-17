"use client";

import { createContext, useContext } from "react";
import type { BillingSummary } from "@/lib/billing/plans";
import { useStored } from "@/lib/store";
import type { Role } from "@/lib/roles";

export interface WorkspaceCtx {
  mode: "demo" | "cloud";
  userId?: string;
  email?: string;
  /** Their name from the Account page, if they set one. */
  name?: string;
  /** Watched or dismissed the onboarding tour already (cloud only). */
  tourSeen?: boolean;
  /** Signed in through SAML SSO: no password to change here. */
  viaSso?: boolean;
  /** The onboarding video, or null when it isn't hosted anywhere yet. */
  helpVideoUrl: string | null;
  role?: Role;
  workspaceId?: string;
  workspaceName: string;
  showSample: boolean;
  /** Admin finished the setup wizard (cloud only; demo uses its own flag). */
  onboarded?: boolean;
  /** True in a seeded demo workspace for sales calls (cloud only). */
  isDemo?: boolean;
  /** Every workspace the person belongs to, for the switcher (cloud only). */
  workspaces?: { id: string; name: string; is_demo: boolean; role: Role }[];
  /** Plan and trial state (cloud only). Absent or enabled=false means nothing is gated. */
  billing?: BillingSummary;
  /** Can open the platform admin console (/admin). Cloud only. */
  platformAdmin?: boolean;
  setShowSample: (v: boolean) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({
  cloud,
  helpVideoUrl = null,
  children,
}: {
  helpVideoUrl?: string | null;
  cloud: {
    userId?: string;
    name?: string;
    tourSeen?: boolean;
    viaSso?: boolean;
    email: string;
    role: Role;
    workspaceId: string;
    workspaceName: string;
    showSample: boolean;
    onboarded?: boolean;
    isDemo?: boolean;
    workspaces?: WorkspaceCtx["workspaces"];
    billing?: BillingSummary;
    platformAdmin?: boolean;
  } | null;
  children: React.ReactNode;
}) {
  const [demoSample, setDemoSample] = useStored<boolean>("cr-show-sample", true);
  const [cloudSample, setCloudSampleLocal] = useStored<boolean | null>(`cr-show-sample-${cloud?.workspaceId ?? "none"}`, null);

  let value: WorkspaceCtx;
  if (!cloud) {
    value = { mode: "demo", helpVideoUrl, workspaceName: "Demo workspace", showSample: demoSample, setShowSample: setDemoSample };
  } else {
    const showSample = cloudSample ?? cloud.showSample;
    value = {
      mode: "cloud",
      helpVideoUrl,
      userId: cloud.userId,
      name: cloud.name,
      tourSeen: cloud.tourSeen,
      viaSso: cloud.viaSso,
      email: cloud.email,
      role: cloud.role,
      workspaceId: cloud.workspaceId,
      workspaceName: cloud.workspaceName,
      onboarded: cloud.onboarded,
      isDemo: cloud.isDemo,
      workspaces: cloud.workspaces,
      billing: cloud.billing,
      platformAdmin: cloud.platformAdmin,
      showSample,
      setShowSample: (v: boolean) => {
        setCloudSampleLocal(v);
        fetch("/api/workspace", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ show_sample_data: v }),
        }).catch(() => undefined);
      },
    };
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
