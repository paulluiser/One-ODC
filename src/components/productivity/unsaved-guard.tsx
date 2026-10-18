"use client";
import { useEffect, useState } from "react";
import { filterFormSignature } from "@/lib/productivity";
type NavigationEvent = Event & {
  destination: { url: string };
  canIntercept: boolean;
};
export function UnsavedChangesGuard() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const baselines = new WeakMap<HTMLFormElement, string>();
    let confirmed = "";
    const editable = (f: HTMLFormElement) =>
      f.getAttribute("method")?.toLowerCase() !== "get" &&
      !f.hasAttribute("data-no-unsaved") &&
      !!f.querySelector(
        'textarea,input:not([type="hidden"]):not([type="submit"]),select',
      );
    const all = () =>
      [...document.forms].filter(
        (f) => f.dataset.unsaved === "true" && f.isConnected,
      );
    const sync = (f: HTMLFormElement) => {
      if (!baselines.has(f)) baselines.set(f, filterFormSignature(f));
    };
    const focus = (e: Event) => {
      const f = (e.target as HTMLElement).closest("form");
      if (f && editable(f)) sync(f);
    };
    const change = (e: Event) => {
      const f = (e.target as HTMLElement).closest("form");
      if (!f || !editable(f)) return;
      sync(f);
      f.dataset.unsaved = String(filterFormSignature(f) !== baselines.get(f));
    };
    const saved = (e: Event) => {
      const f = (e.target as HTMLElement).closest("form");
      if (f) {
        baselines.set(f, filterFormSignature(f));
        f.dataset.unsaved = "false";
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (all().length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const approve = () =>
      !all().length ||
      window.confirm("Leave this page and discard unsaved changes?");
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement,
        link = target.closest<HTMLAnchorElement>("a[href]"),
        summary = target.closest("summary");
      if (
        summary?.parentElement?.hasAttribute("open") &&
        summary.parentElement.querySelector('[data-unsaved="true"]') &&
        !window.confirm("Discard unsaved changes in this section?")
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (
        !link ||
        link.target === "_blank" ||
        link.download ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const url = new URL(link.href, location.href);
      if (url.pathname === location.pathname && url.search === location.search)
        return;
      if (!approve()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else confirmed = url.href;
    };
    const navigation = (window as unknown as { navigation?: EventTarget })
      .navigation;
    const navigate = (event: Event) => {
      const e = event as NavigationEvent;
      if (!e.canIntercept || !e.cancelable) return;
      // Next updates history state while the current record is being saved.
      // Like same-page links, these updates and hash changes do not leave it.
      const destination = new URL(e.destination.url);
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        destination.search === location.search
      )
        return;
      if (e.destination.url === confirmed) {
        confirmed = "";
        return;
      }
      if (!approve()) e.preventDefault();
    };
    // Native navigation interception covers SPA push/replace and Back/Forward in supporting browsers.
    navigation?.addEventListener("navigate", navigate);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          const success = record.target.parentElement?.closest(".form-success"),
            f = success?.closest("form");
          if (f) {
            baselines.set(f, filterFormSignature(f));
            f.dataset.unsaved = "false";
          }
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (const success of [
            ...(node.matches(".form-success") ? [node] : []),
            ...node.querySelectorAll<HTMLElement>(".form-success"),
          ]) {
            const f = success.closest("form");
            if (f) {
              baselines.set(f, filterFormSignature(f));
              f.dataset.unsaved = "false";
            }
          }
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("input", change, true);
    document.addEventListener("change", change, true);
    document.addEventListener("one-odc:saved", saved);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      observer.disconnect();
      navigation?.removeEventListener("navigate", navigate);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("input", change, true);
      document.removeEventListener("change", change, true);
      document.removeEventListener("one-odc:saved", saved);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  return offline ? (
    <p className="form-error" role="alert">
      You are offline. Keep this page open to preserve unsaved entries.
      Reconnect before saving or retrying uploads.
    </p>
  ) : null;
}
