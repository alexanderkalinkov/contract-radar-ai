"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * App-wide "something is happening" feedback, with no per-page wiring:
 * - Counts in-flight fetches (API routes, server actions, Supabase). Route prefetches are ignored.
 * - The button that started the work is greyed out, shows a small spinner and ignores clicks
 *   until the work finishes (data-busy). Mark a button data-nobusy to opt out.
 * - A spinner pill appears bottom-right if work takes longer than a moment.
 * - A thin bar runs along the top while a link navigation is loading.
 */

let inflight = 0;
const listeners = new Set<(n: number) => void>();
const emit = () => listeners.forEach((l) => l(inflight));

function headerOf(init: RequestInit | undefined, input: RequestInfo | URL, name: string) {
  const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const rec = h as Record<string, string>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? rec[key] : null;
}

function patchFetch() {
  const w = window as Window & { __crFetchPatched?: boolean };
  if (w.__crFetchPatched) return;
  w.__crFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Page navigations/prefetches (RSC requests) are shown by the top bar, not the spinner.
    const quiet = headerOf(init, input, "RSC") === "1" || headerOf(init, input, "x-cr-background") === "1";
    if (quiet) return orig(input, init);
    inflight++;
    emit();
    try {
      return await orig(input, init);
    } finally {
      inflight--;
      emit();
    }
  };
}

const BUSY_SELECTOR = "button, input[type=submit]";

function ActivityInner() {
  const path = usePathname();
  const search = useSearchParams();
  const [count, setCount] = useState(0);
  const [showSpinner, setShowSpinner] = useState(false);
  const [nav, setNav] = useState<"idle" | "loading" | "done">("idle");
  const busy = useRef(new Set<HTMLElement>());
  const navKey = `${path}?${search.toString()}`;
  const lastKey = useRef(navKey);

  // Track fetches; release busy buttons once everything settles.
  useEffect(() => {
    patchFetch();
    const onChange = (n: number) => {
      setCount(n);
      if (n === 0) {
        busy.current.forEach((el) => {
          el.removeAttribute("data-busy");
          el.removeAttribute("aria-busy");
        });
        busy.current.clear();
      }
    };
    listeners.add(onChange);
    return () => void listeners.delete(onChange);
  }, []);

  // Spinner only after a short delay so quick saves don't flicker.
  useEffect(() => {
    if (count === 0) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 350);
    return () => clearTimeout(t);
  }, [count]);

  // Clicks: mark the button busy if the click started work; block clicks on busy buttons;
  // start the top bar for internal link navigations.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const blocked = target.closest<HTMLElement>("[data-busy]");
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const btn = target.closest<HTMLElement>(BUSY_SELECTOR);
      if (btn && !btn.hasAttribute("data-nobusy") && !(btn as HTMLButtonElement).disabled) {
        const before = inflight;
        // Give the click handler a tick to start its request (or a form to submit).
        setTimeout(() => {
          if (inflight > before || inflight > 0) {
            btn.setAttribute("data-busy", "");
            btn.setAttribute("aria-busy", "true");
            busy.current.add(btn);
          }
        }, 30);
      }
      const a = target.closest<HTMLAnchorElement>("a[href]");
      if (a && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !a.target && !a.hasAttribute("download")) {
        const url = new URL(a.href, location.href);
        const same = url.origin === location.origin;
        const changes = url.pathname !== location.pathname || url.search !== location.search;
        if (same && changes) setNav("loading");
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Navigation finished: complete the bar, then hide it.
  useEffect(() => {
    if (lastKey.current === navKey) return;
    lastKey.current = navKey;
    setNav((n) => (n === "loading" ? "done" : n));
    const t = setTimeout(() => setNav("idle"), 350);
    return () => clearTimeout(t);
  }, [navKey]);

  // Safety net: never leave the bar running (e.g. a link to the same page).
  useEffect(() => {
    if (nav !== "loading") return;
    const t = setTimeout(() => setNav("idle"), 10000);
    return () => clearTimeout(t);
  }, [nav]);

  return (
    <>
      {nav !== "idle" && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
          <div className={nav === "loading" ? "cr-navbar-loading h-full bg-brand" : "cr-navbar-done h-full bg-brand"} />
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className={
          "pointer-events-none fixed right-4 bottom-4 z-[100] flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg transition-all duration-200 " +
          (showSpinner ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")
        }
      >
        {showSpinner && (
          <>
            <span className="cr-spinner" aria-hidden="true" />
            Working…
          </>
        )}
      </div>
    </>
  );
}

export function Activity() {
  return (
    <Suspense fallback={null}>
      <ActivityInner />
    </Suspense>
  );
}
