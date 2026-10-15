"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
export function ContextPanel({
  title,
  description,
  children,
  triggerLabel,
}: {
  triggerLabel?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="button button-outline">
          {triggerLabel ?? title}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          ref={content}
          className="detail-dialog context-panel"
          onOpenAutoFocus={(event) => {
            const input = content.current?.querySelector<HTMLElement>(
              'input:not([type="hidden"]):not([disabled])',
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
