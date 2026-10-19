"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./installation-dialog.module.css";
export function OperationsDetailsSheet({
  id,
  name,
  status,
  description,
  kind,
  children,
  records,
}: {
  id: string;
  name: string;
  status: ReactNode;
  description: string;
  kind: "installation" | "logistics";
  children: ReactNode;
  records: { id: string; name: string }[];
}) {
  const router = useRouter(),
    path = usePathname(),
    query = useSearchParams(),
    content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const next = new URLSearchParams(query.toString());
    const other =
      kind === "installation" ? "logistics_detail" : "installation_detail";
    if (next.has(other)) {
      next.delete(other);
      router.replace(`${path}?${next}`, { scroll: false });
    }
  }, [kind, path, query, router]);
  const close = () => {
    if (content.current?.querySelector('[aria-busy="true"]')) return;
    if (
      content.current?.querySelector('[data-unsaved="true"]') &&
      !window.confirm("Discard unsaved changes?")
    )
      return;
    const next = new URLSearchParams(query.toString());
    next.delete(`${kind}_detail`);
    next.delete(
      kind === "installation" ? "logistics_detail" : "installation_detail",
    );
    router.push(`${path}?${next}`, { scroll: false });
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.sheetOverlay} />
        <Dialog.Content
          ref={content}
          className={styles.sheet}
          data-kind={kind}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => {
              const row = Array.from(
                document.querySelectorAll<HTMLElement>(
                  `a[data-${kind}-id="${id}"]`,
                ),
              ).find((element) => element.getClientRects().length > 0);
              row?.focus({ preventScroll: true });
            });
          }}
        >
          <header className={styles.sheetHeader}>
            <span className={styles.eyebrow}>
              {kind === "installation"
                ? "Installation space"
                : "Supplier & Logistics"}
            </span>
            <Dialog.Close
              className={styles.close}
              aria-label={`Close ${kind} details`}
            >
              <X size={20} />
            </Dialog.Close>
            <div className={styles.spaceTitle}>
              <Dialog.Title>{name}</Dialog.Title>
              {status}
            </div>
            <Dialog.Description>{description}</Dialog.Description>
            {records.length > 1 && (
              <label className={styles.switcher}>
                {kind === "installation"
                  ? "Installation space"
                  : "Logistics record"}
                <select
                  aria-label={
                    kind === "installation"
                      ? "Switch installation space"
                      : "Switch logistics record"
                  }
                  value={id}
                  onChange={(e) => {
                    const next = new URLSearchParams(query.toString());
                    next.set(`${kind}_detail`, e.target.value);
                    next.delete(
                      kind === "installation"
                        ? "logistics_detail"
                        : "installation_detail",
                    );
                    router.push(`${path}?${next}`, { scroll: false });
                  }}
                >
                  {records.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </header>
          <div className={styles.sheetBody}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
