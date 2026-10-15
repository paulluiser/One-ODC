"use client";
import { Suspense, useState, useSyncExternalStore, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  RefreshCw,
  Bell,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Users,
  X,
  ArrowDownLeft,
  LogOut,
} from "lucide-react";
import { NavigationPending } from "./navigation-pending";
import { WorkspaceBreadcrumbs } from "./workspace-breadcrumbs";
import { Brand } from "./brand";
import { ThemeSelect } from "./theme-select";
import { signOut } from "@/app/login/actions";
import { roleLabels, mayReview, type Profile } from "@/lib/phase1";
const mobileQuery = "(max-width: 800px)";
function subscribeMobile(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const readMobile = () => window.matchMedia(mobileQuery).matches;
export function LiveShell({
  profile,
  logisticsEnabled = false,
  analyticsEnabled = false,
  children,
}: {
  profile: Profile;
  logisticsEnabled?: boolean;
  analyticsEnabled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, () => false);
  const links = [
    { href: "/dashboard", name: "Dashboard", icon: LayoutDashboard },
    ...(profile.role === "bdm" || mayReview(profile.role)
      ? [
          {
            href: "/dashboard/leads",
            name: profile.role === "bdm" ? "My Leads" : "Lead review",
            icon: ArrowDownLeft,
          },
        ]
      : []),
    ...(logisticsEnabled &&
    ["operations_admin", "lead_designer", "system_administrator"].includes(
      profile.role,
    )
      ? [
          {
            href: "/dashboard/suppliers",
            name: "Supplier Masterlist",
            icon: Users,
          },
        ]
      : []),
    { href: "/dashboard/projects", name: "Projects", icon: FolderOpen },
    ...(analyticsEnabled
      ? [{ href: "/dashboard/analytics", name: "Analytics", icon: BarChart3 }]
      : []),
    { href: "/dashboard/notifications", name: "Notifications", icon: Bell },
    ...(profile.role === "system_administrator"
      ? [{ href: "/dashboard/users", name: "User management", icon: Users }]
      : []),
  ];
  const sidebar = (
    <aside
      className={`sidebar ${open ? "sidebar-open" : ""}`}
      aria-label={mobile ? undefined : "Main navigation"}
    >
      {mobile && (
        <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
      )}
      <Link className="sidebar-brand" href="/dashboard">
        <Brand />
      </Link>
      <button
        className="sidebar-close"
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
      >
        <X size={20} />
      </button>
      <div className="workspace-label">
        <span className="workspace-square">O</span>
        <div>
          <b>Design & Operations</b>
          <small>Live workspace</small>
        </div>
      </div>
      <nav>
        {[
          {
            name: "Workspace",
            routes: [
              "/dashboard",
              "/dashboard/projects",
              "/dashboard/analytics",
            ],
          },
          {
            name: "Coordination",
            routes: ["/dashboard/leads", "/dashboard/suppliers"],
          },
          {
            name: "Administration",
            routes: ["/dashboard/notifications", "/dashboard/users"],
          },
        ].map((group) => (
          <div className="nav-group" key={group.name}>
            <span className="nav-caption">{group.name}</span>
            {links
              .filter((l) => group.routes.includes(l.href))
              .map((l) => {
                const selected =
                  l.href === "/dashboard"
                    ? path === l.href
                    : path.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`nav-item ${selected ? "active" : ""}`}
                    aria-current={selected ? "page" : undefined}
                  >
                    <l.icon size={18} aria-hidden="true" />
                    {l.name}
                    <NavigationPending />
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <div className="tiny-line" />
          <p>
            Every space.
            <br />
            <strong>One vision.</strong>
          </p>
        </div>
        <form action={signOut}>
          <button className="nav-item" type="submit">
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </form>
        <div className="profile">
          <span className="profile-avatar">
            {profile.display_name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <b>{profile.display_name}</b>
            <span>{roleLabels[profile.role]}</span>
          </div>
        </div>
      </div>
    </aside>
  );
  return (
    <Dialog.Root open={mobile && open} onOpenChange={setOpen}>
      <div className="workspace live-workspace">
        <a className="skip-link" href="#workspace-main">
          Skip to main content
        </a>
        {mobile ? (
          <Dialog.Portal>
            <Dialog.Overlay className="sidebar-backdrop" />
            <Dialog.Content asChild aria-describedby={undefined}>
              {sidebar}
            </Dialog.Content>
          </Dialog.Portal>
        ) : (
          sidebar
        )}
        <div className="workspace-body">
          <header className="topbar">
            <div className="breadcrumbs">
              <Dialog.Trigger asChild>
                <button
                  className="mobile-menu"
                  aria-label="Open navigation"
                  aria-expanded={open}
                >
                  <Menu size={21} />
                </button>
              </Dialog.Trigger>
              <Suspense fallback={<strong>One ODC</strong>}>
                <WorkspaceBreadcrumbs />
              </Suspense>
            </div>
            <div className="workspace-tools">
              <button
                className="workspace-refresh"
                type="button"
                aria-label="Refresh workspace"
                title="Refresh workspace"
                aria-busy={refreshing}
                disabled={refreshing}
                onClick={() => startRefresh(() => router.refresh())}
              >
                <RefreshCw
                  size={18}
                  className={refreshing ? "spin" : undefined}
                />
              </button>
              <ThemeSelect />
            </div>
            <span className="refresh-announcement sr-only" role="status">
              {refreshing ? "Refreshing workspace…" : ""}
            </span>
          </header>
          <main
            tabIndex={-1}
            id="workspace-main"
            className="main-content"
            aria-busy={refreshing}
          >
            {children}
          </main>
        </div>
      </div>
    </Dialog.Root>
  );
}
