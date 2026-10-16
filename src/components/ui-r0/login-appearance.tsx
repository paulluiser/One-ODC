"use client";
import { useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import shell from "./ui-r0.module.css";
import styles from "./login-appearance.module.css";
const subscribe = () => () => {};
export function LoginAppearance() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const Icon =
    ready && theme === "dark"
      ? Moon
      : ready && theme === "system"
        ? Monitor
        : Sun;
  return (
    <div className={styles.root}>
      <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            className={shell.iconButton}
            aria-label="Choose appearance"
            disabled={!ready}
            type="button"
          >
            <Icon size={20} />
          </button>
        </Dialog.Trigger>
        <Dialog.Content
          className={`${shell.utilityMenu} ${styles.menu}`}
          aria-describedby={undefined}
        >
          <Dialog.Title className={shell.menuTitle}>Appearance</Dialog.Title>
          {(
            [
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "System", Monitor],
            ] as const
          ).map(([value, label, Symbol]) => (
            <button
              key={value}
              type="button"
              className={shell.menuItem}
              aria-pressed={ready && theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
            >
              <Symbol size={17} />
              {label}
              {ready && theme === value && (
                <Check size={16} className={shell.menuCheck} />
              )}
            </button>
          ))}
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
