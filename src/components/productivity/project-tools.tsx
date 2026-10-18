"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Link as LinkIcon, MessageSquare, Layers } from "lucide-react";
import { productivityRequest, ErrorNotice } from "./common";
import type { Profile } from "@/lib/phase1";
import { DisclosureSummary } from "../ui-r2/primitives";
import styles from "./productivity.module.css";
type Person = { id: string; display_name: string };
type Comment = {
  id: string;
  space_id: string | null;
  author_id: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
  comment_mentions: { recipient_id: string }[];
};
type Discussion = {
  readOnly?: boolean;
  records: Comment[];
  people: Person[];
  spaces: { id: string; name: string }[];
  hasMore: boolean;
  designers: Person[];
};
export function ProjectTools({
  project,
  profile,
  compact = false,
}: {
  project: string;
  profile: Profile;
  compact?: boolean;
}) {
  const [access, setAccess] = useState<{
      favorite: boolean;
      canDiscuss: boolean;
      canManage: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [copy, setCopy] = useState(""),
    [busy, setBusy] = useState(false);
  const fallback = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let current = true;
    void productivityRequest<{
      favorite: boolean;
      canDiscuss: boolean;
      canManage: boolean;
    }>({ action: "workspace", project })
      .then((d) => {
        if (current) setAccess(d);
        return productivityRequest({
          action: "remember",
          project,
          favorite: null,
        });
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [project, profile.id]);
  async function favorite() {
    if (!access) return;
    setBusy(true);
    setError("");
    try {
      await productivityRequest({
        action: "remember",
        project,
        favorite: !access.favorite,
      });
      setAccess({ ...access, favorite: !access.favorite });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    const url = new URL(`/dashboard/projects/${project}`, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopy("Project link copied. Recipients still need access.");
    } catch {
      setCopy(url);
      requestAnimationFrame(() => {
        fallback.current?.focus();
        fallback.current?.select();
      });
    }
  }
  return (
    <section
      className={compact ? styles.compactTools : styles.projectTools}
      aria-label="Project productivity"
    >
      <div className={styles.row}>
        <button
          className="button button-outline"
          type="button"
          onClick={() => void copyLink()}
        >
          <LinkIcon size={16} />
          Copy Link
        </button>
        <button
          className="button button-outline"
          type="button"
          disabled={!access || busy}
          aria-pressed={access?.favorite ?? false}
          onClick={() => void favorite()}
        >
          <Star size={16} fill={access?.favorite ? "currentColor" : "none"} />
          {access?.favorite ? "Unfavorite" : "Favorite"}
        </button>
      </div>
      {copy.startsWith("http") ? (
        <label className="live-field">
          Clipboard unavailable. Copy this project URL
          <input ref={fallback} readOnly value={copy} />
        </label>
      ) : (
        <p role="status" className="field-hint">
          {copy}
        </p>
      )}
      <ErrorNotice message={error ? `Project shortcuts: ${error}` : ""} />
      {!compact && access?.canDiscuss && (
        <DiscussionPanel project={project} profile={profile} />
      )}
      {!compact && access?.canManage && <TemplatePanel project={project} />}
    </section>
  );
}
export function DiscussionPanel({
  project,
  profile,
  presentation = "disclosure",
}: {
  project: string;
  profile: Profile;
  presentation?: "disclosure" | "full" | "preview";
}) {
  const [data, setData] = useState<Discussion | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(presentation !== "disclosure"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [body, setBody] = useState(""),
    [mentions, setMentions] = useState<string[]>([]),
    [space, setSpace] = useState(""),
    [reason, setReason] = useState(""),
    [editing, setEditing] = useState<Comment | null>(null),
    [expanded, setExpanded] = useState(false),
    [mentionSearch, setMentionSearch] = useState("");
  const operation = useRef(""),
    form = useRef<HTMLFormElement>(null);
  async function load(p = page) {
    setBusy(true);
    setError("");
    try {
      setData(
        await productivityRequest<Discussion>({
          action: "discussion",
          project,
          page: p,
        }),
      );
      setPage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (presentation === "disclosure") return;
    let current = true;
    void productivityRequest<Discussion>({
      action: "discussion",
      project,
      page: 1,
    })
      .then((value) => {
        if (current) setData(value);
      })
      .catch((error) => {
        if (current) setError(error.message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [project, presentation]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    operation.current ||= crypto.randomUUID();
    try {
      await productivityRequest({
        action: "comment",
        id: editing?.id || operation.current,
        project,
        space: space || null,
        version: editing?.version ?? 0,
        body,
        mentions,
        reason,
      });
      setBody("");
      setMentions([]);
      setSpace("");
      setReason("");
      setEditing(null);
      operation.current = "";
      setSuccess("Comment saved.");
      form.current?.dispatchEvent(
        new CustomEvent("one-odc:saved", { bubbles: true }),
      );
      await load(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function edit(c: Comment) {
    if (body && !window.confirm("Discard your unsaved comment?")) return;
    setEditing(c);
    setBody(c.body);
    setSpace(c.space_id ?? "");
    setMentions(c.comment_mentions.map((m) => m.recipient_id));
    setReason("");
    setSuccess("");
  }
  if (presentation === "preview")
    return (
      <div className={styles.discussionPreview}>
        <ErrorNotice message={error} retry={() => void load(1)} />
        {busy && <p role="status">Loading discussion…</p>}
        {data &&
          (data.records.length ? (
            <>
              <strong>
                {data.people.find((p) => p.id === data.records[0].author_id)
                  ?.display_name || "Project member"}
              </strong>
              <p className={styles.previewText}>{data.records[0].body}</p>
              <small>
                {new Date(data.records[0].created_at).toLocaleString("en-PH")}
              </small>
            </>
          ) : (
            <>
              <MessageSquare size={24} aria-hidden="true" />
              <p>No discussion yet</p>
            </>
          ))}
      </div>
    );
  const inlineMention = body.match(/(?:^|\s)@([^@\n]*)$/)?.[1];
  const Container = presentation === "full" ? "section" : "details";
  return (
    <Container
      className={presentation === "full" ? styles.discussionFull : undefined}
      onToggle={
        presentation === "disclosure"
          ? (e) => {
              if (
                e.target === e.currentTarget &&
                (e.currentTarget as HTMLDetailsElement).open &&
                !data &&
                !busy
              )
                void load();
            }
          : undefined
      }
    >
      {presentation === "disclosure" && (
        <DisclosureSummary className={styles.summary}>
          <MessageSquare size={16} />
          Discussion
        </DisclosureSummary>
      )}
      <p className="field-hint">
        Project discussion is visible to authorized project readers. Use
        @mentions for associated team members; this is not private messaging.
      </p>
      <ErrorNotice message={error} retry={() => void load()} />
      {busy && <p role="status">Loading discussion…</p>}
      {data && (
        <>
          <fieldset
            disabled={data.readOnly}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {data.readOnly && <p>Lost project. Discussions are read-only.</p>}
            <form
              ref={form}
              onSubmit={submit}
              className="live-form"
              data-unsaved={!!body}
              aria-label="Project comment"
            >
              <label className="live-field">
                {editing ? "Correct comment" : "Comment"}
                <textarea
                  aria-label={editing ? "Correct comment" : "Comment"}
                  name="comment"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  maxLength={8000}
                  rows={expanded || body || editing ? 3 : 1}
                  onFocus={() => setExpanded(true)}
                />
              </label>
              {inlineMention !== undefined && (
                <div
                  className={styles.inlineMentions}
                  role="group"
                  aria-label="Mention suggestions"
                >
                  {data.people
                    .filter((p) =>
                      p.display_name
                        .toLowerCase()
                        .includes(inlineMention.toLowerCase()),
                    )
                    .slice(0, 6)
                    .map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        disabled={
                          saving ||
                          (!mentions.includes(p.id) && mentions.length >= 20)
                        }
                        onClick={() => {
                          setMentions((v) =>
                            v.includes(p.id) ? v : [...v, p.id],
                          );
                          setBody((v) =>
                            v.replace(/@[^@\n]*$/, `@${p.display_name} `),
                          );
                          form.current?.querySelector("textarea")?.focus();
                        }}
                      >
                        @{p.display_name}
                      </button>
                    ))}
                </div>
              )}
              <div
                hidden={
                  presentation === "full" && !expanded && !body && !editing
                }
              >
                <label className="live-field">
                  Space (optional)
                  <select
                    aria-label="Space (optional)"
                    name="commentSpace"
                    value={space}
                    disabled={!!editing || saving}
                    onChange={(e) => setSpace(e.target.value)}
                  >
                    <option value="">Project discussion</option>
                    {data.spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend>@Mention team members (optional, up to 20)</legend>
                  <input
                    aria-label="Find a team member to mention"
                    placeholder="Search team members…"
                    value={mentionSearch}
                    onChange={(e) => setMentionSearch(e.target.value)}
                  />
                  <div className={styles.mentions}>
                    {data.people
                      .filter((p) =>
                        p.display_name
                          .toLowerCase()
                          .includes(mentionSearch.toLowerCase()),
                      )
                      .map((p) => (
                        <label key={p.id}>
                          <input
                            type="checkbox"
                            name="mention"
                            value={p.id}
                            disabled={
                              saving ||
                              (!mentions.includes(p.id) &&
                                mentions.length >= 20)
                            }
                            checked={mentions.includes(p.id)}
                            onChange={(e) =>
                              setMentions((v) =>
                                e.target.checked
                                  ? [...v, p.id]
                                  : v.filter((x) => x !== p.id),
                              )
                            }
                          />
                          @{p.display_name}
                        </label>
                      ))}
                  </div>
                </fieldset>
                {editing && (
                  <label className="live-field">
                    Correction reason
                    <input
                      name="commentReason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      maxLength={2000}
                    />
                  </label>
                )}
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editing
                      ? "Save correction"
                      : "Post comment"}
                </button>
                {editing && (
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (!window.confirm("Discard this correction?")) return;
                      setEditing(null);
                      setBody("");
                      setMentions([]);
                      setSpace("");
                      setReason("");
                    }}
                  >
                    Cancel correction
                  </button>
                )}
              </div>
              {success && (
                <p className="form-success" role="status">
                  {success}
                </p>
              )}
            </form>
          </fieldset>
          <ol className={styles.comments}>
            {[...data.records].reverse().map((c) => (
              <li key={c.id}>
                <div className={styles.row}>
                  <strong>
                    {data.people.find((p) => p.id === c.author_id)
                      ?.display_name ?? "Project member"}
                  </strong>
                  <time dateTime={c.created_at}>
                    {new Date(c.created_at).toLocaleString("en-PH")}
                  </time>
                  {c.version > 1 && (
                    <span>
                      Corrected · v{c.version} ·{" "}
                      {new Date(c.updated_at).toLocaleString("en-PH")}
                    </span>
                  )}
                </div>
                {c.space_id && (
                  <small>
                    {data.spaces.find((s) => s.id === c.space_id)?.name ??
                      "Space discussion"}
                  </small>
                )}
                <p className={styles.plainText}>{c.body}</p>
                {c.comment_mentions.length > 0 && (
                  <p className="field-hint">
                    {c.comment_mentions
                      .map(
                        (m) =>
                          "@" +
                          (data.people.find((p) => p.id === m.recipient_id)
                            ?.display_name ?? "Project member"),
                      )
                      .join(" ")}
                  </p>
                )}
                {!data.readOnly &&
                  (c.author_id === profile.id ||
                    profile.role === "system_administrator") && (
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => edit(c)}
                    >
                      Correct comment
                    </button>
                  )}
              </li>
            ))}
          </ol>
          {!data.records.length && <p>No comments yet.</p>}
          <div className={styles.row}>
            <button
              className="button button-outline"
              type="button"
              disabled={page === 1 || busy}
              onClick={() => void load(page - 1)}
            >
              Previous comments
            </button>
            <span>Page {page}</span>
            <button
              className="button button-outline"
              type="button"
              disabled={!data.hasMore || busy}
              onClick={() => void load(page + 1)}
            >
              Older comments
            </button>
          </div>
        </>
      )}
    </Container>
  );
}
type Template = { id: string; name: string; structure: { name: string }[] };
export function TemplatePanel({ project }: { project: string }) {
  const router = useRouter();
  const panel = useRef<HTMLDetailsElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [name, setName] = useState(""),
    [template, setTemplate] = useState(""),
    [primary, setPrimary] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const operation = useRef(""),
    saveId = useRef("");
  useEffect(() => {
    if (success)
      panel.current
        ?.querySelectorAll("form")
        .forEach((f) =>
          f.dispatchEvent(new CustomEvent("one-odc:saved", { bubbles: true })),
        );
  }, [success]);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [t, p] = await Promise.all([
        productivityRequest<{ records: Template[] }>({ action: "templates" }),
        productivityRequest<Discussion>({
          action: "discussion",
          project,
          page: 1,
        }),
      ]);
      setTemplates(t.records);
      setPeople(p.designers);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Both API options and the transactional RPC enforce active Designer membership.
  async function mutate(action: "saveTemplate" | "applyTemplate") {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (action === "saveTemplate") {
        saveId.current ||= crypto.randomUUID();
        await productivityRequest({
          action,
          id: saveId.current,
          project,
          name,
        });
        setName("");
        saveId.current = "";
        setSuccess("Space structure saved.");
        await load();
      } else {
        operation.current ||= crypto.randomUUID();
        const r = await productivityRequest<{ result: number }>({
          action,
          operation: operation.current,
          template,
          project,
          primary,
          confirm,
        });
        operation.current = "";
        setConfirm(false);
        setSuccess(
          `${r.result} new Spaces created. Existing Spaces were preserved.`,
        );
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = templates.find((t) => t.id === template);
  return (
    <details
      ref={panel}
      onToggle={(e) => {
        if (
          e.target === e.currentTarget &&
          e.currentTarget.open &&
          !loaded &&
          !busy
        )
          void load();
      }}
    >
      <DisclosureSummary className={styles.summary}>
        <Layers size={16} />
        Space structure templates
      </DisclosureSummary>
      <p className="field-hint">
        Templates copy active Space names only. New Spaces start Not Started
        with fresh IDs and the selected primary Designer. No money, files,
        dates, histories or previous assignments are copied.
      </p>
      <ErrorNotice message={error} retry={() => void load()} />
      <form
        className="live-form"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate("saveTemplate");
        }}
      >
        <label className="live-field">
          Save this project's structure as
          <input
            name="templateName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              saveId.current = "";
            }}
            maxLength={120}
            required
          />
        </label>
        <button className="button button-outline" disabled={busy} type="submit">
          Save structure template
        </button>
      </form>
      <form
        className="live-form"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate("applyTemplate");
        }}
      >
        <label className="live-field">
          Template
          <select
            aria-label="Template"
            name="template"
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value);
              setConfirm(false);
              operation.current = "";
            }}
            required
            disabled={busy}
          >
            <option value="">Select a template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="live-field">
          Primary Designer
          <select
            aria-label="Primary Designer"
            name="templatePrimary"
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              operation.current = "";
            }}
            required
            disabled={busy}
          >
            <option value="">Select an authorized Designer</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <h4>Preview · {selected.structure.length} new Spaces</h4>
            <ul>
              {selected.structure.map((s, i) => (
                <li key={i}>{s.name}</li>
              ))}
            </ul>
            <label>
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                required
                disabled={busy}
              />
              Add these Spaces, including any duplicate names. Keep all existing
              Spaces.
            </label>
          </>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || !selected || !primary || !confirm}
        >
          {busy ? "Applying…" : "Apply structure template"}
        </button>
      </form>
      {!busy && loaded && !templates.length && <p>No saved templates yet.</p>}
      {success && (
        <p role="status" className="form-success">
          {success}
        </p>
      )}
    </details>
  );
}
