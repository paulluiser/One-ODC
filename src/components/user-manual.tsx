"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  Layers,
  ListChecks,
  Printer,
  Search,
  Settings,
  Truck,
  ChartNoAxesCombined,
  Users,
  UserRound,
} from "lucide-react";
import { roles, type Role } from "@/lib/domain";
import { roleLabels } from "@/lib/phase1";
import {
  guidesForRole,
  manualCategories,
  manualRoleAccess,
  type ManualCategory,
} from "@/lib/user-manual";
import { Scope } from "./ui-r2/primitives";
import styles from "./user-manual.module.css";
const categoryIcons = {
  "Getting Started": BookOpen,
  Projects: FolderOpen,
  Spaces: Layers,
  Work: ListChecks,
  Orders: Truck,
  Reports: ChartNoAxesCombined,
  Settings: Settings,
};
export function UserManual({
  ownRole,
  availability,
}: {
  ownRole: Role;
  availability: Record<string, boolean>;
}) {
  const params = useSearchParams(),
    pathname = usePathname(),
    router = useRouter();
  const allRoles = params.get("mode") === "all";
  const requestedRole = params.get("role");
  const role =
    allRoles && roles.includes(requestedRole as Role)
      ? (requestedRole as Role)
      : ownRole;
  const guides = guidesForRole(role);
  const q = (params.get("q") ?? "").slice(0, 200);
  const requestedCategory = params.get("category");
  const category =
    manualCategories.includes(requestedCategory as ManualCategory) &&
    guides.some((guide) => guide.category === requestedCategory)
      ? (requestedCategory as ManualCategory)
      : "";
  const topic = guides.find((guide) => guide.id === params.get("topic"));
  const filtered = guides.filter(
    (guide) =>
      (!category || guide.category === category) &&
      (!q ||
        `${guide.title} ${guide.summary} ${guide.category} ${guide.steps.join(" ")} ${guide.access}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const categories = manualCategories.filter((value) =>
    guides.some((guide) => guide.category === value),
  );
  const url = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    return `${pathname}?${next}`;
  };
  const openTopic = (id: string) =>
    url({
      topic: id,
      category: guides.find((guide) => guide.id === id)?.category ?? "",
    });
  const index = topic ? guides.findIndex((guide) => guide.id === topic.id) : -1;
  const print = () => window.print();
  return (
    <Scope>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ONE ODC · HELP</p>
          <h1>User Manual</h1>
          <p>
            Guides for {roleLabels[role]}
            {allRoles && role !== ownRole ? " · Reference only" : ""}
          </p>
        </div>
        <form
          action={pathname}
          method="get"
          data-no-unsaved
          className={styles.search}
          key={`${q}-${role}`}
          role="search"
        >
          <Search size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="manual-search">
            Search guides
          </label>
          <input
            id="manual-search"
            name="q"
            defaultValue={q}
            placeholder="Search guides, features, or keywords…"
            maxLength={200}
          />
          {allRoles && (
            <>
              <input type="hidden" name="mode" value="all" />
              <input type="hidden" name="role" value={role} />
            </>
          )}
          {category && <input type="hidden" name="category" value={category} />}
          <button type="submit" className="button button-outline">
            Search
          </button>
        </form>
      </header>
      <div className={styles.controls}>
        <nav className={styles.tabs} aria-label="Manual scope">
          <Link
            href={url({ mode: "", role: "", topic: "", category: "" })}
            aria-current={!allRoles ? "page" : undefined}
          >
            <UserRound size={16} aria-hidden="true" />
            My Manual
          </Link>
          <Link
            href={url({ mode: "all", role, topic: "", category: "" })}
            aria-current={allRoles ? "page" : undefined}
          >
            <Users size={16} aria-hidden="true" />
            All Roles
          </Link>
        </nav>
        <label className={styles.role}>
          Role manual
          <select
            aria-label="Role manual"
            value={role}
            disabled={!allRoles}
            onChange={(event) =>
              router.push(
                url({
                  mode: "all",
                  role: event.target.value,
                  topic: "",
                  category: "",
                }),
              )
            }
          >
            {roles.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {allRoles && (
        <p className={styles.notice}>
          Reference documentation only. Your signed-in role remains{" "}
          {roleLabels[ownRole]}; viewing another manual grants no additional
          permissions.
        </p>
      )}
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Manual topics">
          <Link
            className={styles.overview}
            href={url({ category: "", topic: "" })}
          >
            <BookOpen size={17} aria-hidden="true" />
            All categories
          </Link>
          <nav aria-label="Guide categories">
            {categories.map((value) => {
              const Icon = categoryIcons[value];
              return (
                <div key={value}>
                  <Link
                    href={url({ category: value, topic: "" })}
                    aria-current={
                      (topic?.category ?? category) === value
                        ? "page"
                        : undefined
                    }
                  >
                    <Icon size={17} aria-hidden="true" />
                    {value}
                  </Link>
                  {topic?.category === value && (
                    <ol className={styles.topicNav}>
                      {guides
                        .filter((guide) => guide.category === value)
                        .map((guide) => (
                          <li key={guide.id}>
                            <Link
                              href={openTopic(guide.id)}
                              aria-current={
                                topic.id === guide.id ? "page" : undefined
                              }
                            >
                              {guide.title}
                            </Link>
                          </li>
                        ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>
        <div className={styles.main}>
          {topic ? (
            <article className={styles.reader} data-manual-document>
              <div className={styles.readerTop}>
                <Link href={url({ topic: "", category: topic.category })}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  {topic.category}
                </Link>
                <div className={styles.printActions}>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={print}
                  >
                    <Printer size={16} aria-hidden="true" />
                    Print
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={print}
                  >
                    <Download size={16} aria-hidden="true" />
                    Download PDF
                  </button>
                </div>
              </div>
              <p className={styles.eyebrow}>
                {roleLabels[role]} · {topic.category}
              </p>
              <h2>{topic.title}</h2>
              <p>{topic.summary}</p>
              <p className={styles.pdfHint}>
                Download PDF uses your browser’s print dialog. Choose “Save as
                PDF” as the destination.
              </p>
              {topic.feature && !availability[topic.feature] && (
                <p className={styles.notice}>
                  Unavailable in this environment: this module is not enabled.
                  These instructions are reference only.
                </p>
              )}
              <section className={styles.boundaries}>
                <h3>Access and prerequisites</h3>
                <p>{topic.access}</p>
                <p>{topic.prerequisite}</p>
                {topic.id === "access" && <p>{manualRoleAccess[role]}</p>}
              </section>
              <h3>Step by step</h3>
              <ol className={styles.steps}>
                {topic.steps.map((step, number) => (
                  <li key={step}>
                    <span className={styles.number} aria-hidden="true">
                      {number + 1}
                    </span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              {topic.tip && (
                <section className={styles.tip}>
                  <h3>Tip</h3>
                  <p>{topic.tip}</p>
                </section>
              )}
              <section className={styles.result}>
                <h3>Expected result</h3>
                <p>{topic.result}</p>
              </section>
              <nav
                className={styles.previousNext}
                aria-label="Previous and next topic"
              >
                {index > 0 ? (
                  <Link href={openTopic(guides[index - 1].id)}>
                    <ChevronLeft size={17} aria-hidden="true" />
                    <span>
                      <small>Previous</small>
                      {guides[index - 1].title}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {index < guides.length - 1 && (
                  <Link href={openTopic(guides[index + 1].id)}>
                    <span>
                      <small>Next</small>
                      {guides[index + 1].title}
                    </span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                )}
              </nav>
            </article>
          ) : (
            <>
              <section className={styles.roleSummary}>
                <h2>{roleLabels[role]} guide</h2>
                <p>{manualRoleAccess[role]}</p>
              </section>
              <div className={styles.directoryTitle}>
                <h2>
                  {q
                    ? `Search results${category ? ` · ${category}` : ""}`
                    : category || "Explore your manual"}
                </h2>
                <span>{filtered.length} topics</span>
              </div>
              {!q && !category ? (
                <div className={styles.cards}>
                  {categories.map((value) => {
                    const Icon = categoryIcons[value];
                    const group = guides.filter(
                      (guide) => guide.category === value,
                    );
                    return (
                      <Link
                        href={url({ category: value, topic: "" })}
                        key={value}
                        className={styles.categoryCard}
                      >
                        <div className={styles.illustration}>
                          <Icon
                            size={38}
                            strokeWidth={1.3}
                            aria-hidden="true"
                          />
                          <FileText
                            size={28}
                            strokeWidth={1.3}
                            aria-hidden="true"
                          />
                        </div>
                        <div>
                          <h3>{value}</h3>
                          <p>{group[0].summary}</p>
                          <span>
                            {group.length} topics{" "}
                            <ChevronRight size={15} aria-hidden="true" />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.topicList}>
                  {filtered.map((guide) => (
                    <Link
                      key={guide.id}
                      href={openTopic(guide.id)}
                      className={styles.topicCard}
                    >
                      <FileText size={20} aria-hidden="true" />
                      <span>
                        <strong>{guide.title}</strong>
                        <small>{guide.summary}</small>
                        {guide.feature && !availability[guide.feature] && (
                          <small>Not enabled · Reference only</small>
                        )}
                      </span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </Link>
                  ))}
                  {!filtered.length && (
                    <p>
                      No guides match your search.{" "}
                      <Link href={url({ q: "", category: "", topic: "" })}>
                        Clear search and category
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Scope>
  );
}
