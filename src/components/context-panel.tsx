"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type ReactNode } from "react";
export function ContextPanel({
  title,
  description,
  children,
  triggerLabel,
  resetOnClose = false,
  panelClassName,
  guardUnsaved = false,
  blockPending = false,
  primary = false,
  triggerClassName,
}: {
  panelClassName?: string;
  guardUnsaved?: boolean;
  blockPending?: boolean;
  primary?: boolean;
  triggerClassName?: string;
  triggerLabel?: ReactNode;
  resetOnClose?: boolean;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [session, setSession] = useState(0);
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (
          !next &&
          blockPending &&
          content.current?.querySelector('[aria-busy="true"]')
        )
          return;
        if (
          !next &&
          (guardUnsaved ||
            document.documentElement.dataset.oneOdcBrand === "opulence")
        ) {
          if (content.current?.querySelector('[aria-busy="true"]')) return;
          if (
            content.current?.querySelector('[data-unsaved="true"]') &&
            !window.confirm("Discard unsaved changes?")
          )
            return;
        }
        setOpen(next);
        if (!next && resetOnClose) setSession((value) => value + 1);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            `button ${primary ? "button-primary" : "button-outline"}`
          }
        >
          {triggerLabel ?? title}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={content}
          className={`detail-dialog context-panel ${panelClassName ?? ""}`}
          onOpenAutoFocus={(event) => {
            const input = content.current?.querySelector<HTMLElement>(
              'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
            );
            if (input) {
              event.preventDefault();
              input.focus();
            }
          }}
        >
          <div className="context-panel-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="button button-outline"
                aria-label="Close editor"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          {resetOnClose ? <div key={session}>{children}</div> : children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
