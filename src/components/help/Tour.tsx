"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { IconX } from "@/components/icons";
import { btnGhost, btnPrimary } from "@/components/ui";
import { tourSeenKey } from "@/lib/help";

const OPEN_EVENT = "cr-open-tour";
export const TOUR_POSTER = "/help/tour-poster.jpg";

/** Opens the onboarding video from anywhere (Help page, Account page, sidebar). */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** The onboarding video with a fallback when it can't load. */
export function TourPlayer({ src, autoPlay, onMissing }: { src: string | null; autoPlay?: boolean; onMissing?: () => void }) {
  const [failed, setFailed] = useState(!src);
  if (failed || !src) {
    return (
      <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-xl bg-navy px-6 text-center text-white">
        <span className="font-display text-lg font-semibold">The tour video isn&apos;t available right now</span>
        <span className="max-w-[420px] text-sm text-navy-text">
          Try again in a minute. If it keeps happening, <Link href="/help#support" className="font-semibold text-white underline">tell us</Link> and we&apos;ll fix it.
        </span>
      </div>
    );
  }
  return (
    <video
      src={src}
      poster={TOUR_POSTER}
      controls
      playsInline
      preload="metadata"
      autoPlay={autoPlay}
      onError={() => {
        setFailed(true);
        onMissing?.();
      }}
      className="aspect-[16/10] w-full rounded-xl bg-navy"
    />
  );
}

/** Saves "seen" on the account (and in this browser, so it sticks before the sign-in token refreshes). */
function markSeen(userId: string | undefined, cloud: boolean) {
  try {
    window.localStorage.setItem(tourSeenKey(userId), "1");
  } catch {
    /* private window: the account flag still covers it */
  }
  if (cloud) {
    fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tour_seen: true }),
    }).catch(() => undefined);
  }
}

/**
 * The welcome tour. Opens by itself the first time someone signs in, and any time later
 * from Help, the Account page or the sidebar.
 */
export function TourModal() {
  const ws = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);

  // First visit: open once, unless the account or this browser says they've seen it.
  useEffect(() => {
    if (!ws.helpVideoUrl) return;
    if (ws.mode === "cloud" && ws.tourSeen) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(tourSeenKey(ws.userId)) === "1";
    } catch {
      /* ignore */
    }
    if (!seen) {
      setAuto(true);
      setOpen(true);
    }
  }, [ws.helpVideoUrl, ws.mode, ws.tourSeen, ws.userId]);

  useEffect(() => {
    const onOpen = () => {
      setAuto(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    markSeen(ws.userId, ws.mode === "cloud");
    setOpen(false);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="tour-title"
      onClose={() => open && close()}
      className="m-auto w-[min(960px,calc(100vw-24px))] max-w-none rounded-2xl border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-[#0B1B33]/70"
    >
      {open && (
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-muted">{auto ? `Welcome${ws.name ? `, ${ws.name.split(" ")[0]}` : ""}` : "Help"}</span>
              <h2 id="tour-title" className="m-0 font-display text-[22px] font-semibold">Take the 6-minute tour</h2>
            </div>
            <button type="button" onClick={close} aria-label="Close the tour" className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted hover:bg-chip">
              <IconX />
            </button>
          </div>
          <TourPlayer
            src={ws.helpVideoUrl}
            onMissing={() => {
              // Don't greet a new user with a broken player: close quietly and try again next time.
              if (auto) setOpen(false);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-muted">
              You can watch it again any time from <strong>Help &amp; support</strong> in the menu.
            </p>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Link href="/help#support" onClick={close} className={btnGhost}>
                Ask a question
              </Link>
              <button type="button" onClick={close} className={btnPrimary}>
                {auto ? "Start using Outflow" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
