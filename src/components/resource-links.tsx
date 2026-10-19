"use client";
import { Link2, Plus, X } from "lucide-react";
import styles from "./lead-request.module.css";
import type { ResourceLink } from "@/lib/resources";
export function ResourceLinks({
  links,
  onChange,
  disabled = false,
  error,
  compact = false,
}: {
  links: ResourceLink[];
  onChange: (links: ResourceLink[]) => void;
  disabled?: boolean;
  error?: string;
  compact?: boolean;
}) {
  return (
    <fieldset
      id="resource_links"
      tabIndex={-1}
      className={compact ? styles.links : "live-form"}
      disabled={disabled}
    >
      <legend>
        {compact ? "Files and references" : "Files and Resources"}
      </legend>
      <p className="field-hint">
        {compact
          ? "Paste HTTPS links to drawings, photos, or inspiration."
          : "Optional HTTPS links, up to 20. External resources are not downloaded or synchronized."}
      </p>
      <input
        type="hidden"
        name="resource_links"
        value={JSON.stringify(links)}
      />
      {links.map((link, i) => (
        <div className={compact ? styles.linkRow : "live-field"} key={link.id}>
          {compact && <Link2 size={16} aria-hidden="true" />}
          <label
            className={compact ? "sr-only" : undefined}
            htmlFor={`resource-${link.id}`}
          >
            Resource link {i + 1}
          </label>
          <input
            id={`resource-${link.id}`}
            type="url"
            placeholder="https://…"
            aria-invalid={!!error}
            aria-describedby={error ? "resource-links-error" : undefined}
            required
            maxLength={2048}
            pattern="https://.*"
            value={link.url}
            onChange={(e) =>
              onChange(
                links.map((l) =>
                  l.id === link.id ? { ...l, url: e.target.value } : l,
                ),
              )
            }
          />
          <button
            type="button"
            className={compact ? styles.removeLink : "button button-outline"}
            aria-label={`Remove Link ${i + 1}`}
            onClick={() => onChange(links.filter((l) => l.id !== link.id))}
          >
            {compact ? (
              <X size={16} aria-hidden="true" />
            ) : (
              `Remove Link ${i + 1}`
            )}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-outline"
        disabled={disabled || links.length >= 20}
        onClick={() =>
          onChange([...links, { id: crypto.randomUUID(), url: "" }])
        }
      >
        {compact && <Plus size={16} aria-hidden="true" />}
        Add Link
      </button>
      {compact && (
        <p className="field-hint">
          Up to 20 links. External resources are not downloaded.
        </p>
      )}
      {error && (
        <p id="resource-links-error" role="alert" className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
export function SavedResources({ links }: { links: ResourceLink[] }) {
  return (
    <section className="live-form">
      <h2>Files and Resources</h2>
      {links.length ? (
        <ul>
          {links.map((l, i) => (
            <li key={l.id}>
              <a
                href={l.url}
                style={{ overflowWrap: "anywhere" }}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Resource {i + 1}: {l.url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No resource links provided.</p>
      )}
    </section>
  );
}
