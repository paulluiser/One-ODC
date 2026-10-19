"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Person } from "@/lib/phase1";
import { roleLabels } from "@/lib/phase1";
import styles from "./project-team-dialog.module.css";
export function MemberSelect({
  label,
  options,
  selected,
  onChange,
  multiple = false,
  disabled = false,
  required = false,
}: {
  label: string;
  options: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [position, setPosition] = useState({
      left: 0,
      top: 0,
      width: 0,
      maxHeight: 280,
    });
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const rows = options.filter((p) =>
    p.display_name.toLowerCase().includes(search.toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    const blur = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", blur);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", blur);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const below = innerHeight - rect.bottom - 12,
        above = rect.top - 12,
        height = Math.min(280, Math.max(below, above));
      setPosition({
        left: Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8)),
        top:
          below >= 200 || below >= above
            ? rect.bottom + 5
            : Math.max(8, rect.top - height - 5),
        width: rect.width,
        maxHeight: height,
      });
    };
    place();
    input.current?.focus();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const choose = (person: Person) => {
    onChange(
      multiple
        ? selected.includes(person.id)
          ? selected.filter((id) => id !== person.id)
          : [...new Set([...selected, person.id])]
        : [person.id],
    );
    if (!multiple) {
      setOpen(false);
      button.current?.focus();
    } else input.current?.focus();
  };
  const move = (event: React.KeyboardEvent, start = false) => {
    const choices = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    if (!choices.length) return;
    const current = choices.indexOf(document.activeElement as HTMLElement);
    let index = start
      ? event.key === "ArrowUp"
        ? choices.length - 1
        : 0
      : current + (event.key === "ArrowUp" ? -1 : 1);
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = choices.length - 1;
    choices[(index + choices.length) % choices.length]?.focus();
    event.preventDefault();
  };
  return (
    <div
      ref={root}
      role="group"
      aria-labelledby={`${id}-label`}
      className={styles.select}
    >
      <div className={styles.selectLabel}>
        <span id={`${id}-label`}>
          {label}
          {required ? " *" : ""}
        </span>
        {multiple && <small>{selected.length} selected</small>}
      </div>
      <button
        ref={button}
        type="button"
        className={styles.selectTrigger}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        disabled={disabled}
        onClick={() => {
          setSearch("");
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setSearch("");
            setOpen(true);
          }
        }}
      >
        <span id={`${id}-value`}>
          {multiple
            ? `Choose ${label.toLowerCase()}…`
            : (options.find((p) => p.id === selected[0])?.display_name ??
              (selected[0]
                ? "Current member unavailable — select a replacement"
                : "Choose a member…"))}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {multiple && selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-label={`Remove ${options.find((p) => p.id === value)?.display_name ?? "unavailable member"} from ${label}`}
              onClick={() => onChange(selected.filter((id) => id !== value))}
            >
              {options.find((p) => p.id === value)?.display_name ??
                "Unavailable member"}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {open && (
        <div ref={menu} className={styles.selectMenu} style={position}>
          <div className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input
              ref={input}
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}`}
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls={`${id}-list`}
              value={search}
              placeholder="Search by name…"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                  move(e, true);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (rows.length === 1) choose(rows[0]);
                }
              }}
            />
          </div>
          <div
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            aria-multiselectable={multiple || undefined}
            className={styles.options}
          >
            {rows.length ? (
              rows.map((person) => (
                <button
                  type="button"
                  key={person.id}
                  role="option"
                  aria-selected={selected.includes(person.id)}
                  onClick={() => choose(person)}
                  onKeyDown={(e) => {
                    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                      move(e);
                  }}
                >
                  <span className={styles.check}>
                    {selected.includes(person.id) && (
                      <Check size={15} aria-hidden="true" />
                    )}
                  </span>
                  <span>{person.display_name}</span>
                  <small>{roleLabels[person.role]}</small>
                </button>
              ))
            ) : (
              <p role="status">No matching eligible members.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
