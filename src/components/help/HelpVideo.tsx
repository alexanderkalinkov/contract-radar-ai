"use client";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { TourPlayer } from "./Tour";

/** The tour inline on the Help page. */
export function HelpVideo() {
  return <TourPlayer src={useWorkspace().helpVideoUrl} />;
}
