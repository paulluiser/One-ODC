"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
export function ProjectSectionNavigation({
  children,
  label = "Project workspace",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLElement>(null),
    path = usePathname(),
    params = useSearchParams();
  useEffect(() => {
    if (ref.current) ref.current.dataset.ready = "true";
    const sync = () => {
      const target = window.location.hash
        ? document.getElementById(window.location.hash.slice(1))
        : null;
      if (target instanceof HTMLDetailsElement) target.open = true;
      for (
        let parent = target?.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      target?.scrollIntoView({ block: "start" });
      for (const link of ref.current?.querySelectorAll<HTMLAnchorElement>(
        "a[href]",
      ) ?? []) {
        const url = new URL(link.href),
          hash = window.location.hash.startsWith("#space-")
            ? "#project-spaces"
            : window.location.hash;
        const selected = hash
          ? url.hash === hash && url.pathname === path
          : !url.hash &&
            (url.searchParams.get("tab") ?? "") === (params.get("tab") ?? "");
        if (selected) {
          link.setAttribute("aria-current", "page");
          const container = ref.current;
          if (container) {
            const item = link.getBoundingClientRect(),
              viewport = container.getBoundingClientRect();
            if (item.left < viewport.left)
              container.scrollLeft -= viewport.left - item.left;
            else if (item.right > viewport.right)
              container.scrollLeft += item.right - viewport.right;
          }
        } else link.removeAttribute("aria-current");
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [path, params]);
  return (
    <nav
      ref={ref}
      className="quotation-controls surface project-workspace-nav"
      aria-label={label}
    >
      {children}
    </nav>
  );
}
