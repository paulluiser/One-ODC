"use client";
import { DiscussionBadge } from "../productivity/discussion-sync";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  workspaceTabs,
  workspaceUrl,
  type WorkspaceTab,
} from "@/lib/project-workspace-view";
import styles from "./workspace.module.css";
export function WorkspaceNavigation({
  project,
  tab,
  restricted = false,
}: {
  project: string;
  tab: WorkspaceTab;
  restricted?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    let lastTarget: HTMLElement | null = null;
    const sync = () => {
      const hash = window.location.hash;
      const target =
        hash.startsWith("#space-") || hash === "#project-spaces"
          ? "spaces"
          : hash === "#project-activities"
            ? "activity"
            : null;
      if (target && target !== tab && !restricted) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", target);
        url.searchParams.delete("section");
        if (target === "activity") url.searchParams.set("section", "history");
        router.replace(`${url.pathname}${url.search}${hash}`, {
          scroll: false,
        });
      }
      const element = hash ? document.getElementById(hash.slice(1)) : null;
      if (element && element !== lastTarget) {
        if (element instanceof HTMLDetailsElement) element.open = true;
        for (
          let parent = element.parentElement;
          parent;
          parent = parent.parentElement
        )
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        element.scrollIntoView({ block: "start" });
        lastTarget = element;
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    const observer = new MutationObserver(() => {
      const hash = window.location.hash;
      const target = hash ? document.getElementById(hash.slice(1)) : null;
      if (target && target !== lastTarget) sync();
    });
    observer.observe(document.getElementById("r0-main") ?? document.body, {
      childList: true,
      subtree: true,
    });
    return () => {
      window.removeEventListener("hashchange", sync);
      observer.disconnect();
    };
  }, [project, tab, router, restricted]);
  return (
    <nav className={styles.tabs} aria-label="Project workspace">
      {workspaceTabs
        .filter((t) => !restricted || t === "overview")
        .map((t) => (
          <Link
            key={t}
            href={workspaceUrl(project, t)}
            aria-current={tab === t ? "page" : undefined}
          >
            {t[0].toUpperCase() + t.slice(1)}
            {t === "activity" && <DiscussionBadge project={project} />}
          </Link>
        ))}
    </nav>
  );
}

export function ProjectActionMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !document.querySelector('[role="dialog"]')
      )
        ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        ref.current?.open &&
        !document.querySelector('[role="dialog"]')
      ) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    const menu = ref.current;
    const closeLink = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]") && menu)
        menu.open = false;
    };
    const navigate = (event: KeyboardEvent) => {
      if (!menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
        return;
      const controls = Array.from(
        menu.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"),
      );
      if (!controls.length) return;
      event.preventDefault();
      menu.open = true;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? controls.length - 1
            : event.key === "ArrowDown"
              ? (current + 1) % controls.length
              : current < 0
                ? controls.length - 1
                : (current - 1 + controls.length) % controls.length;
      controls[next].focus();
    };
    menu?.addEventListener("click", closeLink);
    menu?.addEventListener("keydown", navigate);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      menu?.removeEventListener("click", closeLink);
      menu?.removeEventListener("keydown", navigate);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className={styles.actionMenu} ref={ref}>
      <summary id="project-actions-trigger" aria-label="Project actions">
        <MoreHorizontal size={20} aria-hidden="true" />
      </summary>
      <div className={styles.actionPanel}>
        <header className={styles.actionHeader}>
          <h2>Project actions</h2>
          <p>Manage and take action on this project.</p>
        </header>
        {children}
      </div>
    </details>
  );
}
