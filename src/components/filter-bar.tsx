"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  activeToolbarFilters,
  clearToolbarFilters,
  toolbarUrl,
  validateToolbarValues,
  mergePendingToolbarValues,
  type FilterConfig,
} from "@/lib/filter-toolbar";
import styles from "./filter-bar.module.css";
export type FilterBarProps = {
  leading?: ReactNode;
  compact?: boolean;
  unframed?: boolean;
  config: FilterConfig;
  values: Record<string, string>;
  resultCount?: number;
  resultLabel?: string;
  recovery?: { values: Record<string, string>; errors: Record<string, string> };
  validate?: (values: Record<string, string>) => Record<string, string>;
  hint?: string;
};
export function FilterBar(props: FilterBarProps) {
  return <Toolbar {...props} />;
}
function Toolbar({
  config,
  values,
  resultCount,
  resultLabel,
  recovery,
  validate,
  hint,
  leading,
  compact = false,
  unframed = false,
}: FilterBarProps) {
  const router = useRouter(),
    id = useId();
  const popover = useRef<HTMLDetailsElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [search, setSearch] = useState(
    config.search ? (values[config.search.key] ?? "") : "",
  );
  const initialDraft = () => ({
    ...values,
    ...Object.fromEntries(
      config.fields.map((field) => [
        field.key,
        field.disabled
          ? (field.defaultValue ?? "")
          : (recovery?.values[field.key] ??
            values[field.key] ??
            field.defaultValue ??
            ""),
      ]),
    ),
  });
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>(
    recovery?.errors ?? {},
  );
  const [failure, setFailure] = useState("");
  const [pending, startTransition] = useTransition();
  const signature = JSON.stringify({ values, recovery });
  const [snapshot, setSnapshot] = useState(signature);
  if (snapshot !== signature) {
    setSnapshot(signature);
    setSearch(config.search ? (values[config.search.key] ?? "") : "");
    setDraft(initialDraft());
    setErrors(recovery?.errors ?? {});
  }
  const retry = useRef(values),
    active = activeToolbarFilters(config, values);
  useEffect(() => {
    const element = popover.current;
    const position = () => {
      if (!element?.open) return;
      const rect = element.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 48);
      element.style.setProperty(
        "--popover-left",
        `${Math.max(24 - rect.left, Math.min(0, window.innerWidth - 24 - rect.left - width))}px`,
      );
    };
    element?.addEventListener("toggle", position);
    window.addEventListener("resize", position);
    const outside = (event: PointerEvent) => {
      if (!popover.current?.contains(event.target as Node) && popover.current)
        popover.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && popover.current?.open) {
        popover.current.open = false;
        popover.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      element?.removeEventListener("toggle", position);
      window.removeEventListener("resize", position);
    };
  }, []);
  function apply(next: Record<string, string>) {
    if (pending) next = mergePendingToolbarValues(values, retry.current, next);
    if (timer.current) clearTimeout(timer.current);
    const issues = {
      ...validateToolbarValues(config, next),
      ...validate?.(next),
    };
    setErrors(issues);
    if (Object.keys(issues).length) {
      setDraft(next);
      if (popover.current) popover.current.open = true;
      document.getElementById(`${id}-${Object.keys(issues)[0]}`)?.focus();
      return;
    }
    retry.current = next;
    if (!navigator.onLine) {
      setFailure("You’re offline. Reconnect and retry applying filters.");
      return;
    }
    setFailure("");
    if (popover.current) popover.current.open = false;
    startTransition(() =>
      router.push(
        toolbarUrl(
          window.location.pathname,
          window.location.search,
          config,
          next,
        ),
        { scroll: false },
      ),
    );
  }
  const withSearch = (next: Record<string, string>) =>
    config.search ? { ...next, [config.search.key]: search } : next;
  return (
    <section
      className={`${styles.bar} ${compact ? styles.compact : ""} ${unframed ? styles.unframed : ""}`}
      aria-label={config.label}
      aria-busy={pending}
    >
      {recovery && (
        <p className={styles.notice} role="alert">
          These filters weren’t applied. Showing default results; correct the
          highlighted fields in Filters.
        </p>
      )}
      <div className={styles.toolbar}>
        {leading}
        {config.search && (
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label={config.search.label ?? config.search.placeholder}
              placeholder={config.search.placeholder}
              value={search}
              maxLength={200}
              onChange={(event) => {
                const q = event.target.value;
                setSearch(q);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(
                  () => apply({ ...values, [config.search!.key]: q }),
                  350,
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  apply(withSearch(values));
                }
              }}
            />
          </label>
        )}
        {config.fields.length > 0 && (
          <details
            ref={popover}
            className={styles.filterMenu}
            open={recovery ? true : undefined}
          >
            <summary
              onClick={() => {
                if (!popover.current?.open) {
                  setDraft(initialDraft());
                  setErrors(recovery?.errors ?? {});
                }
              }}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              Filters
              {active.length > 0 && (
                <span
                  className={styles.badge}
                  aria-label={`${active.length} active filters`}
                >
                  {active.length}
                </span>
              )}
            </summary>
            <form
              method="get"
              data-no-unsaved
              className={styles.popover}
              aria-label={`${config.label} options`}
              onSubmit={(event) => {
                event.preventDefault();
                apply(withSearch(draft));
              }}
            >
              <h3>Filter records</h3>
              {config.presets && (
                <div className={styles.presets}>
                  {config.presets.map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      onClick={() => {
                        const next = { ...draft, ...preset.values };
                        setDraft(next);
                        setErrors(validate?.(next) ?? {});
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.fields}>
                {config.fields.map((field) => (
                  <label key={field.key} htmlFor={`${id}-${field.key}`}>
                    {field.label}
                    {field.type === "date" || field.type === "month" ? (
                      <input
                        id={`${id}-${field.key}`}
                        name={field.key}
                        aria-label={field.label}
                        type={field.type}
                        min={field.min}
                        max={field.max}
                        value={draft[field.key] ?? field.defaultValue ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            [field.key]: event.target.value,
                          })
                        }
                        aria-invalid={!!errors[field.key]}
                        aria-describedby={
                          errors[field.key]
                            ? `${id}-${field.key}-error`
                            : undefined
                        }
                      />
                    ) : (
                      <select
                        id={`${id}-${field.key}`}
                        name={field.key}
                        aria-label={field.label}
                        disabled={field.disabled}
                        value={draft[field.key] ?? field.defaultValue ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            [field.key]: event.target.value,
                          })
                        }
                        aria-invalid={!!errors[field.key]}
                        aria-describedby={
                          errors[field.key]
                            ? `${id}-${field.key}-error`
                            : undefined
                        }
                      >
                        {field.options?.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                        {draft[field.key] &&
                          !field.options?.some(
                            (option) => option.value === draft[field.key],
                          ) && (
                            <option value={draft[field.key]}>
                              Unavailable value — choose another
                            </option>
                          )}
                      </select>
                    )}
                    {field.hint && <small>{field.hint}</small>}
                    {errors[field.key] && (
                      <small
                        id={`${id}-${field.key}-error`}
                        className={styles.error}
                      >
                        {errors[field.key]}
                      </small>
                    )}
                  </label>
                ))}
              </div>
              {hint && <p className={styles.hint}>{hint}</p>}
              <div className={styles.actions}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={pending}
                >
                  {pending ? "Applying…" : "Apply filters"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (popover.current) popover.current.open = false;
                  }}
                >
                  Cancel
                </button>
              </div>
              {Object.keys(errors).length > 0 && (
                <p className={styles.error} role="alert">
                  Check the highlighted fields. Current results are unchanged.
                </p>
              )}
            </form>
          </details>
        )}
        {config.sort && (
          <label className={styles.sort}>
            <span>Sort</span>
            <select
              aria-label={config.sort.label ?? "Sort records"}
              value={values[config.sort.key] ?? config.sort.defaultValue}
              onChange={(event) =>
                apply(
                  withSearch({
                    ...values,
                    [config.sort!.key]: event.target.value,
                  }),
                )
              }
            >
              {config.sort.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {resultCount !== undefined && (
          <span className={styles.count} role="status">
            {resultCount.toLocaleString()}{" "}
            {resultLabel ?? (resultCount === 1 ? "result" : "results")}
          </span>
        )}
      </div>
      {active.length > 0 && (
        <div className={styles.chips} aria-label="Applied filters">
          {active.map((chip) => (
            <button
              type="button"
              key={chip.key}
              aria-label={`Remove ${chip.label}: ${chip.display}`}
              onClick={() =>
                apply(withSearch(clearToolbarFilters(config, values, chip.key)))
              }
            >
              {chip.label}: {chip.display}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
          <button
            className={styles.clear}
            type="button"
            onClick={() =>
              apply(withSearch(clearToolbarFilters(config, values)))
            }
          >
            Clear all
          </button>
        </div>
      )}
      {pending && (
        <p className={styles.hint} role="status">
          Updating results…
        </p>
      )}
      {failure && (
        <p className={styles.error} role="alert">
          {failure}{" "}
          <button type="button" onClick={() => apply(retry.current)}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
