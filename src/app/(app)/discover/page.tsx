"use client";

import Link from "next/link";
import { PageHeader, btnGhost } from "@/components/ui";
import { DiscoveryPage } from "@/components/discovery/Discovery";

export default function Discover() {
  return (
    <>
      <PageHeader eyebrow="Accounting + sign-in data" title="Discovered tools">
        <Link href="/tools" className={btnGhost}>Tools &amp; survey</Link>
      </PageHeader>
      <DiscoveryPage />
    </>
  );
}
