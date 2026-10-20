"use client";
import { useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { BriefcaseBusiness, Check, Coffee, Copy, X } from "lucide-react";
import styles from "./coffee-support.module.css";
const email = "paulluiser@gmail.com";
export function CoffeeSupport({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState("coffee");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const id = useId();
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  async function copyEmail() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(email);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setOption("coffee");
        setCopyState("idle");
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`${className} ${styles.trigger}`}
          aria-label="Coffee support"
          title="Buy me a coffee ☕"
        >
          <Coffee
            size={24}
            strokeWidth={1.8}
            aria-hidden="true"
            className={styles.cup}
          >
            <path className={styles.steam} d="M6 6c-2-1.5 2-2.5 0-4" />
            <path className={styles.steam} d="M10 6c-2-1.5 2-2.5 0-4" />
            <path className={styles.steam} d="M14 6c-2-1.5 2-2.5 0-4" />
          </Coffee>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`detail-dialog ${styles.modal}`}>
          <Dialog.Close asChild>
            <button
              type="button"
              className={`button button-outline ${styles.close}`}
              aria-label="Close coffee support"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </Dialog.Close>
          <span className={styles.symbol}>
            <Coffee size={32} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <Dialog.Title className={styles.title}>
            Enjoying the system?
          </Dialog.Title>
          <Dialog.Description className={styles.description}>
            If One ODC has been helpful, consider showing some support or
            getting in touch for work opportunities.
          </Dialog.Description>
          <fieldset className={styles.segments}>
            <legend className="sr-only">Support options</legend>
            {[
              { value: "coffee", label: "Buy me a coffee", icon: Coffee },
              { value: "hire", label: "Hire me", icon: BriefcaseBusiness },
            ].map(({ value, label, icon: Icon }) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`${id}-support`}
                  value={value}
                  checked={option === value}
                  onChange={() => {
                    setOption(value);
                    setCopyState("idle");
                  }}
                />
                <span>
                  <Icon size={19} aria-hidden="true" />
                  {label}
                </span>
              </label>
            ))}
          </fieldset>
          <div className={styles.content}>
            {option === "coffee" ? (
              <div className={styles.donation}>
                <Image
                  src="/support/coffee-qr.png"
                  alt="Donation QR code for buying a coffee"
                  width={540}
                  height={544}
                  unoptimized
                  className={styles.qr}
                />
                <p>
                  Scan to buy me a coffee. Works on all e-wallets and digital
                  banks. Thanks for your support!
                </p>
              </div>
            ) : (
              <div className={styles.hire}>
                <p>Have a project in mind? Let’s work together.</p>
                <div className={styles.email}>
                  <input
                    aria-label="Contact email"
                    readOnly
                    value={email}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={copyEmail}
                    aria-label={
                      copyState === "copied" ? "Copied!" : "Copy Email"
                    }
                    title="Copy Email"
                  >
                    {copyState === "copied" ? (
                      <Check size={17} aria-hidden="true" />
                    ) : (
                      <Copy size={17} aria-hidden="true" />
                    )}
                    <span>
                      {copyState === "copied" ? "Copied!" : "Copy Email"}
                    </span>
                  </button>
                </div>
                <p role="status" className={styles.feedback}>
                  {copyState === "failed"
                    ? "Couldn’t copy. Select the email address to copy it manually."
                    : copyState === "copied"
                      ? "Copied!"
                      : ""}
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
