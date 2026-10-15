"use client";
import { useEffect, useRef, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";
import { PendingIndicator } from "./operation-feedback";
export function WorkspaceError({
  reset,
  standalone = false,
}: {
  reset: () => void;
  standalone?: boolean;
}) {
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const Container = standalone ? "main" : "section";
  return (
    <Container
      className={
        standalone ? "state-page" : "surface live-form workspace-error"
      }
    >
      <TriangleAlert size={28} aria-hidden="true" />
      <h2 ref={heading} tabIndex={-1}>
        Your workspace could not be loaded
      </h2>
      <p role="alert">
        The request did not complete. Retry to load current authorized records.
      </p>
      <Button
        disabled={pending}
        aria-busy={pending}
        onClick={() => start(() => reset())}
      >
        {pending ? "Retrying…" : "Retry workspace"}
      </Button>
      <PendingIndicator pending={pending} label="Retrying workspace…" />
    </Container>
  );
}
