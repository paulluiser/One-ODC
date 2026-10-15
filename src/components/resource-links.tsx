"use client";
import type { ResourceLink } from "@/lib/resources";
export function ResourceLinks({
  links,
  onChange,
  disabled = false,
  error,
}: {
  links: ResourceLink[];
  onChange: (links: ResourceLink[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <fieldset
      id="resource_links"
      tabIndex={-1}
      className="live-form"
      disabled={disabled}
    >
      <legend>Files and Resources</legend>
      <p className="field-hint">
        Optional HTTPS links, up to 20. External resources are not downloaded or
        synchronized.
      </p>
      <input
        type="hidden"
        name="resource_links"
        value={JSON.stringify(links)}
      />
      {links.map((link, i) => (
        <div className="live-field" key={link.id}>
          <label htmlFor={`resource-${link.id}`}>Resource link {i + 1}</label>
          <input
            id={`resource-${link.id}`}
            type="url"
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
            className="button button-outline"
            onClick={() => onChange(links.filter((l) => l.id !== link.id))}
          >
            Remove Link {i + 1}
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
        Add Link
      </button>
      {error && (
        <p role="alert" className="field-error">
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
