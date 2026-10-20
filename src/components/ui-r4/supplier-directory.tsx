"use client";
import Link from "next/link";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { FilterBar } from "../filter-bar";
import { DirectoryTable } from "../ui-r2/directory-table";
import { Heading, Scope, Status } from "../ui-r2/primitives";
import { LogisticsForm } from "../logistics-form";
import type { Supplier } from "@/lib/logistics";
import { formatTime } from "@/lib/phase1";
import shared from "../ui-r2/ui-r2.module.css";
import styles from "./supplier-directory.module.css";
export function SupplierDirectory({
  suppliers,
  search,
  sort,
  status = "",
  page,
  count,
  selectedId,
}: {
  suppliers: Supplier[];
  search: string;
  sort: string;
  status?: string;
  page: number;
  count: number;
  selectedId?: string;
}) {
  const [editor, setEditor] = useState<{
    id: string;
    supplier?: Supplier;
  } | null>(() => {
    const supplier = suppliers.find((s) => s.id === selectedId);
    return supplier ? { id: supplier.id, supplier } : null;
  });
  const [message, setMessage] = useState("");
  const url = (nextPage = page, nextSort = sort, supplier?: string) =>
    `/dashboard/suppliers?${new URLSearchParams({ q: search, sort: nextSort, status, page: String(nextPage), ...(supplier ? { supplier } : {}) })}`;
  return (
    <Scope>
      <Heading
        title="Supplier/Brand Masterlist"
        description="Supplier contacts and availability, in one directory."
        action={
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setMessage("");
              setEditor({ id: crypto.randomUUID() });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add supplier
          </button>
        }
      />
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      <section className={shared.directory}>
        <FilterBar
          resultCount={count}
          values={{ q: search, sort, status }}
          config={{
            label: "Supplier filters",
            search: {
              key: "q",
              label: "Search suppliers",
              placeholder: "Search supplier name…",
            },
            sort: {
              key: "sort",
              label: "Sort suppliers",
              defaultValue: "name",
              options: [
                { value: "name", label: "Name A–Z" },
                { value: "name_desc", label: "Name Z–A" },
                { value: "updated", label: "Recently updated" },
              ],
            },
            fields: [
              {
                key: "status",
                label: "Availability",
                options: [
                  { value: "", label: "All suppliers" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
              },
            ],
          }}
        />
        <DirectoryTable
          label="Supplier directory table"
          caption="Supplier/Brand Masterlist. Open a supplier to manage its details."
          primaryKey="supplier"
          onOpen={(id) => {
            const supplier = suppliers.find((s) => s.id === id);
            if (supplier) {
              setMessage("");
              setEditor({ id, supplier });
            }
          }}
          columns={[
            {
              key: "supplier",
              label: "Supplier Name / Brand",
              width: 250,
              sortHref: url(1, sort === "name" ? "name_desc" : "name"),
              sortDirection:
                sort === "name"
                  ? "ascending"
                  : sort === "name_desc"
                    ? "descending"
                    : "none",
            },
            { key: "person", label: "Contact person", width: 175 },
            { key: "contact", label: "Contact details", width: 230 },
            { key: "status", label: "Status", width: 110 },
            {
              key: "updated",
              label: "Last updated",
              width: 180,
              sortHref: url(1, "updated"),
              sortDirection: sort === "updated" ? "descending" : "none",
            },
          ]}
          rows={suppliers.map((s) => ({
            id: s.id,
            href: url(page, sort, s.id),
            label: s.name,
            mobileTitle: (
              <span className={styles.identity}>
                <strong>{s.name}</strong>
                <small>{s.brand || "No brand"}</small>
              </span>
            ),
            cells: {
              supplier: (
                <span className={styles.identity}>
                  <strong>{s.name}</strong>
                  <small>{s.brand || "No brand"}</small>
                </span>
              ),
              person: (
                <span className={styles.copy}>
                  {s.contact_person || "Not provided"}
                </span>
              ),
              contact: (
                <span className={styles.copy}>
                  {s.contact_details || "Not provided"}
                </span>
              ),
              status: <Status>{s.active ? "Active" : "Inactive"}</Status>,
              updated: formatTime(s.updated_at),
            },
          }))}
        />
        {!suppliers.length && (
          <p className={shared.empty}>
            No suppliers match your search or filters.
          </p>
        )}
        <nav className={shared.pagination} aria-label="Supplier pages">
          <span>
            {count
              ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, count)} of ${count}`
              : "0"}{" "}
            suppliers · Page {page}
          </span>
          {page > 1 && <Link href={url(page - 1)}>Previous</Link>}
          {page * 50 < count && <Link href={url(page + 1)}>Next</Link>}
        </nav>
      </section>
      <Dialog.Root
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className={`detail-dialog ${styles.modal}`}
            aria-describedby={undefined}
            onInteractOutside={(e) => {
              if (
                document.querySelector('[role="dialog"] form[aria-busy="true"]')
              )
                e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (
                document.querySelector('[role="dialog"] form[aria-busy="true"]')
              )
                e.preventDefault();
            }}
          >
            <div className={styles.heading}>
              <Dialog.Title>
                {editor?.supplier ? "Edit supplier" : "Add supplier"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="button button-outline"
                  aria-label="Close supplier editor"
                  onClick={(e) => {
                    if (
                      e.currentTarget
                        .closest('[role="dialog"]')
                        ?.querySelector('form[aria-busy="true"]')
                    )
                      e.preventDefault();
                  }}
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            {editor && (
              <LogisticsForm
                key={`${editor.id}-${editor.supplier?.version ?? 0}`}
                compact
                id={editor.id}
                supplier={editor.supplier}
                onSaved={() => {
                  setEditor(null);
                  setMessage("Supplier saved.");
                }}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Scope>
  );
}
