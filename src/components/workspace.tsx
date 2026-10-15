"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileCheck2,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  ArrowUpRight,
  Check,
  Layers3,
  CircleDot,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeSelect } from "@/components/theme-select";
import { Button } from "@/components/ui/button";
import { projects, reviews, type Project } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const navigation: {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: ArrowDownLeft, count: 1 },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "my-work", label: "My Work", icon: ClipboardList },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: Activity },
];
type Detail = {
  title: string;
  label: string;
  description: string;
  project?: Project;
};
function Badge({ text }: { text: string }) {
  return (
    <span
      className={cn(
        "status",
        text === "On Track"
          ? "status-green"
          : text === "Overdue"
            ? "status-red"
            : "status-amber",
      )}
    >
      <span />
      {text}
    </span>
  );
}
function Empty({ query = false }: { query?: boolean }) {
  return (
    <div className="empty-state">
      <Search size={24} />
      <h3>{query ? "No matching projects" : "You’re all caught up"}</h3>
      <p>
        {query
          ? "Try a different project name, designer, or reference."
          : "There’s nothing waiting for your attention here."}
      </p>
    </div>
  );
}

export function Workspace({
  section,
  initialFilter,
}: {
  section: string;
  initialFilter: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [read, setRead] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const rememberFocus = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };
  const openDetail = (value: Detail) => {
    rememberFocus();
    setDetail(value);
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    returnFocus.current?.focus();
  };
  const title =
    [...navigation, { id: "settings", label: "Settings" }].find(
      (n) => n.id === section,
    )?.label ?? "Dashboard";
  const filtered = projects.filter(
    (p) =>
      `${p.name} ${p.id} ${p.designer} ${p.location}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All projects" || filter === p.risk),
  );
  const openProject = (project: Project) =>
    openDetail({
      title: project.name,
      label: project.id,
      description:
        "Demonstration project overview. All names, amounts, and records in this workspace are fictional.",
      project,
    });
  const openReview = (review: (typeof reviews)[number]) =>
    openDetail({
      title: review.name,
      label: review.type,
      description: `${review.detail}. ${review.age}. This is a read-only preview; review decisions and persistence are planned for the next implementation phases.`,
    });
  const projectList = (
    <section className="surface projects-section">
      <div className="section-heading">
        <div>
          <h2>
            {section === "dashboard"
              ? "Projects in focus"
              : "Project directory"}
          </h2>
          <p>Every detail, moving in the right direction.</p>
        </div>
        {section === "dashboard" && (
          <Link className="text-link" href="/demo?page=projects">
            All projects <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      <label className="mobile-project-search">
        <Search size={16} />
        <input
          aria-label="Search projects on mobile"
          placeholder="Search projects or designers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="project-filters">
        <div className="filter-tabs" aria-label="Filter projects">
          {["All projects", "On Track", "At Risk", "Overdue"].map((f) => (
            <button
              key={f}
              className={cn(filter === f && "selected")}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === "All projects" && <span>{projects.length}</span>}
            </button>
          ))}
        </div>
        <SlidersHorizontal size={16} aria-hidden="true" />
      </div>
      {filtered.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PROJECT / CLIENT</th>
                <th>DESIGNER</th>
                <th>DESIGN PROGRESS</th>
                <th>DEADLINE</th>
                <th>HEALTH</th>
                <th>
                  <span className="sr-only">Open project</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button
                      className="project-name"
                      onClick={() => openProject(p)}
                    >
                      {p.name}
                    </button>
                    <span className="project-reference">
                      {p.id} <i>·</i> {p.brand}
                    </span>
                  </td>
                  <td>
                    <div className="person">
                      <span className={cn("avatar", p.tone)}>{p.initials}</span>
                      <span>{p.designer}</span>
                    </div>
                  </td>
                  <td>
                    <div className="progress-label">
                      <span>
                        {p.completed} of {p.spaces} spaces
                      </span>
                      <b>{Math.round((p.completed / p.spaces) * 100)}%</b>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-label={`${p.name} design completion`}
                      aria-valuenow={Math.round((p.completed / p.spaces) * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        style={{ width: `${(p.completed / p.spaces) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td
                    className={cn(
                      "deadline",
                      p.risk === "Overdue" && "overdue",
                    )}
                  >
                    {new Intl.DateTimeFormat("en-PH", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${p.deadline}T00:00:00Z`))}
                    <small>
                      {p.risk === "Overdue" ? "2 days overdue" : "2026"}
                    </small>
                  </td>
                  <td>
                    <Badge text={p.risk} />
                  </td>
                  <td>
                    <button
                      className="row-arrow"
                      aria-label={`Open ${p.name}`}
                      onClick={() => openProject(p)}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty query />
      )}
      <div className="table-footer">
        <span>
          Showing {filtered.length} of {projects.length} projects
        </span>
        <span>Demonstration data · 13 Oct 2026</span>
      </div>
    </section>
  );
  const reviewQueue = (
    <section className="surface attention">
      <div className="section-heading">
        <div className="heading-with-icon">
          <span className="attention-dot" />
          <h2>Attention required</h2>
          <span className="count-label">{reviews.length}</span>
        </div>
        <span className="muted small">A little focus goes a long way.</span>
      </div>
      <div className="review-rows">
        {reviews.map((r) => {
          const Icon =
            r.icon === "lead"
              ? ArrowDownLeft
              : r.icon === "quote"
                ? FileCheck2
                : Layers3;
          return (
            <div className="review-row" key={r.id}>
              <span className={cn("review-icon", r.icon)}>
                <Icon size={20} />
              </span>
              <div className="review-copy">
                <span className="review-type">{r.type}</span>
                <h3>{r.name}</h3>
                <p>{r.detail}</p>
              </div>
              <span
                className={cn("review-age", r.icon === "revision" && "overdue")}
              >
                <Clock3 size={13} />
                {r.age}
              </span>
              <Button variant="outline" onClick={() => openReview(r)}>
                {r.action}
                <ArrowRight size={14} />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to main content
      </a>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={cn("sidebar", menuOpen && "sidebar-open")}
        aria-label="Main navigation"
      >
        <Link
          href="/demo"
          className="sidebar-brand"
          aria-label="One ODC dashboard"
        >
          <Brand />
        </Link>
        <button
          className="sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        >
          <PanelLeftClose size={20} />
        </button>
        <div className="workspace-label">
          <span className="workspace-square">O</span>
          <div>
            <b>Design & Operations</b>
            <small>Company workspace</small>
          </div>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {navigation.map((item) => (
            <Link
              key={item.id}
              href={item.id === "dashboard" ? "/demo" : `/demo?page=${item.id}`}
              className={cn("nav-item", section === item.id && "active")}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="tiny-line" />
            <p>
              Considered design.
              <br />
              <strong>Connected people.</strong>
            </p>
            <span>ONE TEAM. ONE ODC.</span>
          </div>
          <Link
            href="/demo?page=settings"
            className={cn("nav-item", section === "settings" && "active")}
          >
            <Settings2 size={19} />
            Settings
          </Link>
          <button
            className="nav-item"
            onClick={() =>
              openDetail({
                title: "Welcome to One ODC",
                label: "WORKSPACE GUIDE",
                description:
                  "Explore the dashboard, filter projects, inspect project status, and change your appearance. This foundation uses fictional demonstration data. Your System Administrator will provision accounts when live authentication and workflows are configured.",
              })
            }
          >
            <CircleHelp size={19} />
            Help & resources
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="profile-avatar">AR</span>
            <div>
              <b>Alex Rivera</b>
              <span>Lead Designer · Demo</span>
            </div>
            <span className="profile-online" />
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={13} aria-hidden="true" />
            <strong>{title}</strong>
          </div>
          <div className="topbar-tools">
            <label className="global-search">
              <Search size={16} />
              <input
                aria-label="Search projects"
                placeholder="Search projects, people…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <span className="demo-indicator">DEMO WORKSPACE</span>
            <ThemeSelect />
            <button
              className="notifications-button"
              aria-label="Open notifications"
              onClick={() => {
                rememberFocus();
                setNotifications(true);
              }}
            >
              <Bell size={19} />
              {!read && <span />}
            </button>
          </div>
        </header>
        <main id="workspace-main" className="main-content">
          <div className="page-intro">
            <div>
              <span className="eyebrow">A SHARED PERSPECTIVE</span>
              <h1>{section === "dashboard" ? "Design overview" : title}</h1>
              <p>
                {section === "dashboard"
                  ? "Good morning, Alex. Let’s bring every detail together."
                  : section === "projects"
                    ? "One place for every project, person, and next step."
                    : section === "leads"
                      ? "Turn the next possibility into a considered project."
                      : section === "my-work"
                        ? "A clear view of what needs your attention."
                        : section === "calendar"
                          ? "Make room for what comes next."
                          : section === "reports"
                            ? "See the progress behind the bigger picture."
                            : "Make this workspace feel like yours."}
              </p>
            </div>
            <div className="intro-date">
              <CalendarDays size={16} />
              <span>Tuesday, 13 October 2026</span>
              <small>Demonstration snapshot</small>
            </div>
          </div>
          {section === "dashboard" && (
            <>
              <div className="metric-grid">
                {[
                  {
                    label: "Active projects",
                    value: projects.length,
                    icon: FolderOpen,
                    note: "Across design & operations",
                    filter: "All projects",
                    tone: "blue",
                  },
                  {
                    label: "At risk",
                    value: projects.filter((p) => p.risk === "At Risk").length,
                    icon: CircleDot,
                    note: "Upcoming deadlines",
                    filter: "At Risk",
                    tone: "amber",
                  },
                  {
                    label: "Pending reviews",
                    value: 2,
                    icon: FileCheck2,
                    note: "1 lead · 1 quotation",
                    page: "leads",
                    tone: "blue",
                  },
                  {
                    label: "Overdue spaces",
                    value: 1,
                    icon: Clock3,
                    note: "Kitchen · Casa de Lorenzo",
                    page: "my-work",
                    tone: "red",
                  },
                ].map((m) => (
                  <Link
                    key={m.label}
                    className="metric-card"
                    href={
                      m.page
                        ? `/demo?page=${m.page}`
                        : `/demo?page=projects&filter=${encodeURIComponent(m.filter!)}`
                    }
                  >
                    <div>
                      <span>{m.label}</span>
                      <m.icon size={18} className={m.tone} />
                    </div>
                    <strong>{String(m.value).padStart(2, "0")}</strong>
                    <p>
                      <span className={cn("metric-dot", m.tone)} />
                      {m.note}
                      <ArrowUpRight size={14} />
                    </p>
                  </Link>
                ))}
              </div>
              {reviewQueue}
              <div className="lower-grid">
                {projectList}
                <aside className="right-rail">
                  <section className="surface workload">
                    <div className="section-heading">
                      <h2>Team perspective</h2>
                      <Users size={17} className="muted" />
                    </div>
                    <p className="rail-description">Active space assignments</p>
                    {["Isabel Santos", "Marco Reyes", "Sofia Cruz"].map(
                      (name) => {
                        const own = projects.filter((p) => p.designer === name);
                        const count = own.reduce((n, p) => n + p.spaces, 0);
                        return (
                          <div className="workload-person" key={name}>
                            <div className="person">
                              <span className={cn("avatar", own[0].tone)}>
                                {own[0].initials}
                              </span>
                              <div>
                                <b>{name}</b>
                                <small>{own.length} projects</small>
                              </div>
                              <strong>
                                {count}
                                <small>spaces</small>
                              </strong>
                            </div>
                            <div className="workload-track">
                              <span
                                style={{ width: `${(count / 15) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      },
                    )}
                    <div className="rail-footnote">
                      Assignments include completed spaces.
                    </div>
                  </section>
                  <section className="up-next">
                    <div className="up-next-title">
                      <span className="eyebrow">ON THE HORIZON</span>
                      <ArrowUpRight size={17} />
                    </div>
                    <span className="next-day">
                      15<span>OCT</span>
                    </span>
                    <h3>Parkside Penthouse</h3>
                    <p>
                      Project deadline
                      <br />
                      Marco Reyes · 5 spaces
                    </p>
                    <button onClick={() => openProject(projects[1])}>
                      View project <ArrowRight size={15} />
                    </button>
                    <div className="corner-lines" aria-hidden="true" />
                  </section>
                </aside>
              </div>
              <div className="workspace-footer">
                <span>Every space. One vision.</span>
                <span>
                  ONE ODC <i>/</i> OPULENCE DESIGN CONCEPT
                </span>
              </div>
            </>
          )}
          {section === "projects" && projectList}
          {(section === "leads" || section === "my-work") && (
            <>
              <div className="demo-banner">
                <Sparkles size={16} />
                <p>
                  Demonstration queue. Decisions and updates will become
                  available with live workflows.
                </p>
              </div>
              {reviewQueue}
            </>
          )}
          {section === "calendar" && (
            <section className="surface calendar-section">
              <div className="section-heading">
                <div>
                  <h2>October 2026</h2>
                  <p>Project deadlines · Asia/Manila</p>
                </div>
                <span className="muted small">Fixed demonstration month</span>
              </div>
              <div className="calendar-grid">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                  <div className="calendar-weekday" key={d}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: 3 }, (_, i) => (
                  <div className="calendar-day blank" key={`blank-${i}`} />
                ))}
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1;
                  const items = projects.filter(
                    (p) => Number(p.deadline.slice(-2)) === day,
                  );
                  return (
                    <div
                      className={cn(
                        "calendar-day",
                        day === 13 && "calendar-today",
                      )}
                      key={day}
                    >
                      <span>{day}</span>
                      {items.map((p) => (
                        <button key={p.id} onClick={() => openProject(p)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {section === "reports" && (
            <>
              <div className="demo-banner">
                <Activity size={16} />
                <p>
                  Project health report · {projects.length} fictional projects ·
                  snapshot at 13 October 2026.
                </p>
              </div>
              {projectList}
            </>
          )}
          {section === "settings" && (
            <div className="settings-grid">
              <section className="surface settings-section">
                <span className="eyebrow">PERSONAL PREFERENCES</span>
                <h2>Your appearance</h2>
                <p>
                  Choose Light, Dark, or Follow System. Your preference is saved
                  in this browser.
                </p>
                <ThemeSelect />
              </section>
              <section className="surface settings-section">
                <span className="eyebrow">WORKSPACE CONNECTIONS</span>
                <h2>Integration readiness</h2>
                <div className="integration-row">
                  <span>Supabase Auth & PostgreSQL</span>
                  <span>Configuration required</span>
                </div>
                <div className="integration-row">
                  <span>Supabase Storage</span>
                  <span>Not connected</span>
                </div>
                <p className="muted small">
                  Connection status in this demo is illustrative. See the setup
                  guide for live configuration.
                </p>
              </section>
              <section className="surface settings-section">
                <span className="eyebrow">IDENTITY</span>
                <h2>One ODC</h2>
                <p>The project workspace for Opulence Design Concept.</p>
                <Link className="text-link" href="/branding/index.html">
                  View the brand identity <ArrowUpRight size={15} />
                </Link>
                <Link className="text-link" href="/login">
                  Back to sign in <ArrowRight size={15} />
                </Link>
              </section>
            </div>
          )}
        </main>
      </div>
      <Dialog.Root
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="detail-dialog"
            onCloseAutoFocus={restoreFocus}
          >
            <span className="eyebrow">{detail?.label}</span>
            <Dialog.Title>{detail?.title}</Dialog.Title>
            <Dialog.Description>{detail?.description}</Dialog.Description>
            {detail?.project && (
              <div className="project-detail">
                <div>
                  <span>Project health</span>
                  <Badge text={detail.project.risk} />
                </div>
                <div>
                  <span>Commercial status</span>
                  <b>{detail.project.commercial}</b>
                </div>
                <div>
                  <span>Design completion</span>
                  <b>
                    {detail.project.completed} of {detail.project.spaces} spaces
                  </b>
                </div>
                <div>
                  <span>Installation status</span>
                  <b>{detail.project.installation}</b>
                </div>
                <div>
                  <span>Designer</span>
                  <b>{detail.project.designer}</b>
                </div>
                <div>
                  <span>Location</span>
                  <b>{detail.project.location}</b>
                </div>
                <div>
                  <span>Deadline</span>
                  <b>{detail.project.deadline}</b>
                </div>
                <p className="detail-note">
                  Commercial closure, design completion, and installation are
                  tracked independently.
                </p>
              </div>
            )}
            <div className="dialog-footer">
              <span>Read-only demonstration</span>
              <Dialog.Close asChild>
                <Button variant="outline">
                  Done <Check size={15} />
                </Button>
              </Dialog.Close>
            </div>
            <Dialog.Close className="dialog-close" aria-label="Close details">
              <X size={20} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={notifications} onOpenChange={setNotifications}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="detail-dialog"
            onCloseAutoFocus={restoreFocus}
          >
            <span className="eyebrow">YOUR WORKSPACE</span>
            <Dialog.Title>Notifications</Dialog.Title>
            <Dialog.Description>
              Demonstration reminders for your review queue.
            </Dialog.Description>
            {reviews.map((r) => (
              <div className="notification-row" key={r.id}>
                <Bell size={16} />
                <div>
                  <b>{r.name}</b>
                  <p>
                    {r.type} · {r.age}
                  </p>
                </div>
              </div>
            ))}
            <div className="dialog-footer">
              <span>{read ? "All reminders read" : "3 unread reminders"}</span>
              <Button
                variant="outline"
                onClick={() => setRead(true)}
                disabled={read}
              >
                Mark all as read
              </Button>
            </div>
            <Dialog.Close
              className="dialog-close"
              aria-label="Close notifications"
            >
              <X size={20} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
