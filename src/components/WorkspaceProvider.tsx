"use client";

import { createContext, useContext } from "react";
import type { BillingSummary } from "@/lib/billing/plans";
import { useStored } from "@/lib/store";

export interface WorkspaceCtx {
  mode: "demo" | "cloud";
  email?: string;
  role?: "owner" | "member";
  workspaceId?: string;
  workspaceName: string;
  showSample: boolean;
  /** Admin finished the setup wizard (cloud only; demo uses its own flag). */
  onboarded?: boolean;
  /** Plan and trial state (cloud only). Absent or enabled=false means nothing is gated. */
  billing?: BillingSummary;
  setShowSample: (v: boolean) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({
  cloud,
  children,
}: {
  cloud: { email: string; role: "owner" | "member"; workspaceId: string; workspaceName: string; showSample: boolean; onboarded?: boolean; billing?: BillingSummary } | null;
  children: React.ReactNode;
}) {
  const [demoSample, setDemoSample] = useStored<boolean>("cr-show-sample", true);
  const [cloudSample, setCloudSampleLocal] = useStored<boolean | null>(`cr-show-sample-${cloud?.workspaceId ?? "none"}`, null);

  let value: WorkspaceCtx;
  if (!cloud) {
    value = { mode: "demo", workspaceName: "Demo workspace", showSample: demoSample, setShowSample: setDemoSample };
  } else {
    const showSample = cloudSample ?? cloud.showSample;
    value = {
      mode: "cloud",
      email: cloud.email,
      role: cloud.role,
      workspaceId: cloud.workspaceId,
      workspaceName: cloud.workspaceName,
      onboarded: cloud.onboarded,
      billing: cloud.billing,
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
