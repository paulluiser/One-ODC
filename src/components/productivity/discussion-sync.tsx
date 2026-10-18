"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { productivityRequest } from "./common";
import styles from "./productivity.module.css";
type Snapshot = { projects: Record<string, number>; notifications?: number };
const empty: Snapshot = { projects: {} };
let snapshot = empty;
let generation = 0;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let queued = false;
export function refreshDiscussion() {
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  const current = generation;
  inFlight = productivityRequest<Snapshot>({ action: "discussionUnread" })
    .then((data) => {
      if (current !== generation) return;
      snapshot = data;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      /* Preserve the last confirmed count during an outage. */
    })
    .finally(() => {
      inFlight = null;
      if (queued) {
        queued = false;
        void refreshDiscussion();
      }
    });
  return inFlight;
}
export function discussionChanged() {
  window.dispatchEvent(new Event("one-odc:discussion"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("one-odc-discussion");
    channel.postMessage("changed");
    channel.close();
  }
}
export function useDiscussionCounts() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => snapshot,
    () => empty,
  );
}
export function DiscussionSync({ user }: { user: string }) {
  const path = usePathname();
  useEffect(() => {
    generation++;
    snapshot = empty;
    listeners.forEach((fn) => fn());
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshDiscussion();
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("one-odc-discussion")
        : null;
    if (channel) channel.onmessage = refresh;
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("one-odc:discussion", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("one-odc:discussion", refresh);
      document.removeEventListener("visibilitychange", refresh);
      snapshot = empty;
    };
  }, [user]);
  useEffect(() => {
    void refreshDiscussion();
  }, [path]);
  return null;
}
export function DiscussionBadge({
  project,
  dot = false,
}: {
  project: string;
  dot?: boolean;
}) {
  const { projects } = useDiscussionCounts();
  const count = projects[project] ?? 0;
  return count > 0 ? (
    <span
      className={dot ? styles.unreadDot : styles.unread}
      aria-label={`${count} unread discussion messages`}
      role={dot ? "img" : undefined}
    >
      {!dot && (count > 99 ? "99+" : count)}
    </span>
  ) : null;
}
