"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { workspaceCrumbs } from "@/lib/workspace-navigation";
export function WorkspaceBreadcrumbs() {
  const path = usePathname(),
    params = useSearchParams(),
    crumbs = workspaceCrumbs(path, params.get("tab"));
  return (
    <nav aria-label="Breadcrumb" className="workspace-crumbs">
      {crumbs.map((c, i) => (
        <span key={`${c.href}-${i}`}>
          {i > 0 && (
            <span aria-hidden="true" className="crumb-divider">
              /
            </span>
          )}
          {i === crumbs.length - 1 ? (
            <span aria-current="page">{c.label}</span>
          ) : (
            <Link href={c.href}>{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
