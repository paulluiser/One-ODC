"use client";
import {
  GlobalSearch,
  WorkspaceHelp,
  ProjectShortcuts,
} from "../productivity/header";
import { ProjectTools } from "../productivity/project-tools";
import { UnsavedChangesGuard } from "../productivity/unsaved-guard";
import { CsvExport } from "../productivity/common";
import {
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { OneODCLogo } from "../one-odc-logo";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FolderOpen,
  ArrowDownLeft,
  ChartNoAxesCombined,
  Truck,
  CalendarDays,
  Bell,
  Sun,
  Moon,
  Monitor,
  X,
  Check,
  LogOut,
  RefreshCw,
  ArrowUpRight,
  Users,
} from "lucide-react";
import { roleLabels, type Profile } from "@/lib/phase1";
import { signOut } from "@/app/login/actions";
import styles from "./ui-r0.module.css";
const subscribe = (fn: () => void) => {
  const m = window.matchMedia("(max-width: 900px)");
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};
const mobile = () => window.matchMedia("(max-width: 900px)").matches;
const readySubscribe = () => () => {};
export function RebuildShell({
  profile,
  unread,
  calendarEnabled,
  children,
}: {
  profile: Profile;
  unread: number;
  calendarEnabled: boolean;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false),
    [themeOpen, setThemeOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false);
  const isMobile = useSyncExternalStore(subscribe, mobile, () => false),
    ready = useSyncExternalStore(
      readySubscribe,
      () => true,
      () => false,
    );
  const { theme, setTheme } = useTheme(),
    path = usePathname(),
    router = useRouter(),
    [refreshing, startRefresh] = useTransition();
  const manager = ["lead_designer", "system_administrator"].includes(
    profile.role,
  );
  const routes = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/projects", label: "Projects", icon: FolderOpen },
    ...(manager || profile.role === "bdm"
      ? [
          {
            href: "/dashboard/leads",
            label: profile.role === "bdm" ? "My leads" : "Lead review",
            icon: ArrowDownLeft,
          },
        ]
      : []),
    {
      href: "/dashboard/analytics",
      label: "Analytics",
      icon: ChartNoAxesCombined,
    },
    ...(manager || profile.role === "operations_admin"
      ? [{ href: "/dashboard/suppliers", label: "Suppliers", icon: Truck }]
      : []),
    ...(profile.role === "system_administrator"
      ? [{ href: "/dashboard/users", label: "Team access", icon: Users }]
      : []),
  ];
  const section = path.split("/")[2],
    context = section
      ? ((
          {
            projects: "Projects",
            leads: profile.role === "bdm" ? "My leads" : "Lead review",
            analytics: "Analytics",
            suppliers: "Suppliers",
            calendar: "Calendar",
            notifications: "Notifications",
            users: "Team access",
          } as Record<string, string>
        )[section] ?? "Workspace")
      : "Overview";
  const initials = profile.display_name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  const RailElement = isMobile ? "div" : "aside";
  const rail = (
    <RailElement
      className={styles.rail}
      aria-label={isMobile ? undefined : "Primary navigation"}
    >
      {isMobile && (
        <Dialog.Title className={styles.srOnly}>
          Workspace navigation
        </Dialog.Title>
      )}
      <Link
        href="/dashboard"
        aria-label="One ODC overview"
        onClick={() => setDrawer(false)}
        className={styles.logo}
      >
        <OneODCLogo variant="compact" />
      </Link>
      {isMobile && (
        <Dialog.Close className={styles.close} aria-label="Close navigation">
          <X size={20} />
        </Dialog.Close>
      )}
      <div className={styles.railLabel}>WORKSPACE</div>
      <nav className={styles.navigation}>
        {routes.map((route) => {
          const selected =
            route.href === "/dashboard"
              ? path === route.href
              : path.startsWith(route.href);
          return (
            <Link
              key={route.href}
              href={route.href}
              aria-current={selected ? "page" : undefined}
              className={styles.navLink}
              onClick={() => setDrawer(false)}
            >
              <route.icon size={19} strokeWidth={1.7} aria-hidden="true" />
              {route.label}
              {selected && <span className={styles.navDot} />}
            </Link>
          );
        })}
      </nav>
      <div className={styles.railFoot}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <WorkspaceHelp profile={profile} className={styles.iconButton} />
          <ProjectShortcuts className={styles.iconButton} />
        </div>
        <div className={styles.brandRule} />
        <p>
          Every space.
          <br />
          <strong>One vision.</strong>
        </p>
        <span>OPULENCE DESIGN CONCEPT</span>
        <Link href="/dashboard" className={styles.workspaceIdentity}>
          <span className={styles.identityIcon}>
            <LayoutDashboard size={16} />
          </span>
          <span>
            Design & operations<small>{roleLabels[profile.role]}</small>
          </span>
        </Link>
      </div>
    </RailElement>
  );
  return (
    <div className={styles.root}>
      <a href="#r0-main" className={styles.skip}>
        Skip to main content
      </a>
      <Dialog.Root open={isMobile && drawer} onOpenChange={setDrawer}>
        {isMobile ? (
          <Dialog.Portal>
            <Dialog.Overlay className={styles.drawerOverlay} />
            <Dialog.Content asChild aria-describedby={undefined}>
              {rail}
            </Dialog.Content>
          </Dialog.Portal>
        ) : (
          rail
        )}
        <div className={styles.body}>
          <header className={styles.header}>
            <div className={styles.pageContext}>
              {isMobile && (
                <Dialog.Trigger asChild>
                  <button
                    className={`${styles.iconButton} ${styles.brandNavigation}`}
                    aria-label="Open navigation"
                  >
                    <OneODCLogo variant="icon" decorative />
                  </button>
                </Dialog.Trigger>
              )}
              <div>
                <h1>{context}</h1>
                <p>{roleLabels[profile.role]} Workspace</p>
              </div>
            </div>
            <div className={styles.utilities} aria-label="Workspace utilities">
              <GlobalSearch className={styles.iconButton} />
              {calendarEnabled && (
                <Link
                  className={styles.iconButton}
                  href="/dashboard/calendar"
                  aria-label="Open calendar"
                  title="Calendar"
                >
                  <CalendarDays size={20} strokeWidth={1.8} />
                </Link>
              )}
              <Link
                className={styles.iconButton}
                href="/dashboard/notifications"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                title="Notifications"
              >
                <Bell size={20} strokeWidth={1.8} />
                {unread > 0 && (
                  <span aria-hidden="true" className={styles.unreadBadge}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <Dialog.Root
                modal={false}
                open={themeOpen}
                onOpenChange={setThemeOpen}
              >
                <Dialog.Trigger asChild>
                  <button
                    className={styles.iconButton}
                    aria-label="Choose appearance"
                    disabled={!ready}
                    title="Appearance"
                  >
                    {ready && theme === "dark" ? (
                      <Moon size={20} />
                    ) : (
                      <Sun size={20} />
                    )}
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Content
                    className={`${styles.utilityMenu} ${styles.themeMenu}`}
                    aria-describedby={undefined}
                  >
                    <Dialog.Title className={styles.menuTitle}>
                      Appearance
                    </Dialog.Title>
                    {[
                      ["light", "Light", Sun],
                      ["dark", "Dark", Moon],
                      ["system", "System", Monitor],
                    ].map(([value, label, Icon]) => {
                      const Symbol = Icon as typeof Sun;
                      return (
                        <button
                          key={value as string}
                          className={styles.menuItem}
                          aria-pressed={ready && theme === value}
                          onClick={() => {
                            setTheme(value as string);
                            setThemeOpen(false);
                          }}
                        >
                          <Symbol size={17} />
                          {label as string}
                          {ready && theme === value && (
                            <Check size={16} className={styles.menuCheck} />
                          )}
                        </button>
                      );
                    })}
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
              <Dialog.Root
                modal={false}
                open={profileOpen}
                onOpenChange={setProfileOpen}
              >
                <Dialog.Trigger asChild>
                  <button
                    className={styles.avatar}
                    aria-label="Open account menu"
                    disabled={!ready}
                    title={profile.display_name}
                  >
                    {initials}
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Content
                    className={`${styles.utilityMenu} ${styles.accountMenu}`}
                    aria-describedby={undefined}
                  >
                    <Dialog.Title className={styles.menuTitle}>
                      {profile.display_name}
                    </Dialog.Title>
                    <p className={styles.menuSubtitle}>
                      {roleLabels[profile.role]}
                    </p>
                    <Link
                      href="/dashboard"
                      className={styles.menuItem}
                      onClick={() => setProfileOpen(false)}
                    >
                      <LayoutDashboard size={17} />
                      My workspace
                      <ArrowUpRight size={15} className={styles.menuCheck} />
                    </Link>
                    <button
                      className={styles.menuItem}
                      disabled={refreshing}
                      onClick={() => {
                        if (
                          document.querySelector('form[data-unsaved="true"]') &&
                          !window.confirm(
                            "Reload current records and discard unsaved changes?",
                          )
                        )
                          return;
                        startRefresh(() => router.refresh());
                      }}
                    >
                      <RefreshCw size={17} />
                      {refreshing ? "Refreshing…" : "Refresh workspace"}
                    </button>
                    <form action={signOut}>
                      <button
                        type="submit"
                        className={`${styles.menuItem} ${styles.signOut}`}
                      >
                        <LogOut size={17} />
                        Sign out
                      </button>
                    </form>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </header>
          <main id="r0-main" tabIndex={-1} className={styles.content}>
            <UnsavedChangesGuard />
            {/^\/dashboard\/projects\/[0-9a-f-]{36}$/.test(path) && (
              <ProjectTools
                key={path.split("/")[3]}
                project={path.split("/")[3]}
                profile={profile}
              />
            )}
            {(path === "/dashboard/projects" ||
              path === "/dashboard/leads") && (
              <CsvExport
                kind={path.endsWith("leads") ? "leads" : "projects"}
                label="Export filtered page CSV"
              />
            )}
            {children}
          </main>
          <span className={styles.srOnly} role="status">
            {refreshing ? "Refreshing authorized records…" : ""}
          </span>
        </div>
      </Dialog.Root>
    </div>
  );
}
