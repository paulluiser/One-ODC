"use client";
import { useEffect, useRef, useState } from "react";
import {
  Flag,
  Link as LinkIcon,
  MessageSquare,
  Layers,
  AtSign,
  Send,
} from "lucide-react";
import { discussionChanged } from "./discussion-sync";
import { productivityRequest, ErrorNotice } from "./common";
import type { Profile } from "@/lib/phase1";
import { DisclosureSummary } from "../ui-r2/primitives";
import styles from "./productivity.module.css";
type Person = { id: string; display_name: string };
type Comment = {
  id: string;
  space_id: string | null;
  space: { name: string } | null;
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
          <Flag size={16} fill={access?.favorite ? "currentColor" : "none"} />
          {access?.favorite ? "Unflag" : "Flag"}
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
    [editing, setEditing] = useState<Comment | null>(null),
    [mentionSearch, setMentionSearch] = useState(""),
    [mentionOpen, setMentionOpen] = useState(false),
    [opened, setOpened] = useState(presentation === "full");
  const readIds = useRef(new Set<string>());
  const lastMessage = useRef("");
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
          message: window.location.hash.startsWith("#comment-")
            ? window.location.hash.slice(9)
            : undefined,
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
      message: window.location.hash.startsWith("#comment-")
        ? window.location.hash.slice(9)
        : undefined,
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
  useEffect(() => {
    if (!opened || presentation === "preview") return;
    let current = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const value = await productivityRequest<Discussion>({
          action: "discussion",
          project,
          page,
          message: window.location.hash.startsWith("#comment-")
            ? window.location.hash.slice(9)
            : undefined,
        });
        if (current) {
          setData(value);
          setError("");
        }
      } catch (error) {
        if (current) setError((error as Error).message);
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("one-odc:discussion", refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("one-odc:discussion", refresh);
    };
  }, [project, page, opened, presentation]);
  useEffect(() => {
    if (!data || !opened || presentation === "preview") return;
    let active = true;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      const ids = data.records
        .filter((c) => c.author_id !== profile.id && !readIds.current.has(c.id))
        .map((c) => c.id);
      if (!ids.length) return;
      void productivityRequest({
        action: "readDiscussion",
        project,
        comments: ids,
      })
        .then(() => {
          ids.forEach((id) => readIds.current.add(id));
          if (active) discussionChanged();
        })
        .catch((e) => {
          if (active)
            setError(
              `Messages loaded, but read state could not be saved. ${e.message}`,
            );
        });
    };
    const frame = requestAnimationFrame(mark);
    document.addEventListener("visibilitychange", mark);
    const id = window.location.hash.slice(1);
    if (id.startsWith("comment-") && lastMessage.current !== id) {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: "center" });
        lastMessage.current = id;
      }
    }
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [data, opened, project, presentation, profile.id]);
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
        reason: "",
      });
      setBody("");
      setMentions([]);
      setSpace("");
      setEditing(null);
      operation.current = "";
      setSuccess("Comment saved.");
      discussionChanged();
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
    setSuccess("");
    requestAnimationFrame(() =>
      form.current?.querySelector("textarea")?.focus(),
    );
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
              if (e.target === e.currentTarget)
                setOpened((e.currentTarget as HTMLDetailsElement).open);
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
      <ErrorNotice message={error} retry={() => void load()} />
      {busy && <p role="status">Loading discussion…</p>}
      {data && (
        <>
          <ol
            className={styles.discussionFeed}
            aria-label="Project discussion messages"
          >
            {[...data.records]
              .sort(
                (a, b) =>
                  a.created_at.localeCompare(b.created_at) ||
                  a.id.localeCompare(b.id),
              )
              .map((c) => {
                const author =
                  data.people.find((p) => p.id === c.author_id)?.display_name ??
                  "Project member";
                return (
                  <li key={c.id} id={`comment-${c.id}`} tabIndex={-1}>
                    <span className={styles.avatar} aria-hidden="true">
                      {author
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <div className={styles.messageBody}>
                      <div className={styles.messageMeta}>
                        <strong>{author}</strong>
                        <time dateTime={c.created_at}>
                          {new Date(c.created_at).toLocaleString("en-PH")}
                        </time>
                        {c.version > 1 && <small>Edited · v{c.version}</small>}
                      </div>
                      {c.space_id && (
                        <span className={styles.messageSpace}>
                          <Layers size={13} aria-hidden="true" />
                          <span>
                            Space:{" "}
                            {c.space?.name ??
                              data.spaces.find((s) => s.id === c.space_id)
                                ?.name ??
                              "Linked space"}
                          </span>
                        </span>
                      )}
                      <p className={styles.plainText}>{c.body}</p>
                      {!data.readOnly &&
                        (c.author_id === profile.id ||
                          profile.role === "system_administrator") && (
                          <button
                            type="button"
                            className={styles.quietAction}
                            onClick={() => edit(c)}
                          >
                            Edit
                          </button>
                        )}
                    </div>
                  </li>
                );
              })}
          </ol>
          {!data.records.length && (
            <div className={styles.discussionEmpty}>
              <MessageSquare size={28} aria-hidden="true" />
              <h3>No discussions yet</h3>
              <p>Start a conversation with your project team.</p>
            </div>
          )}
          {(page > 1 || data.hasMore) && (
            <div className={styles.row}>
              <button
                type="button"
                className="button button-outline"
                disabled={page === 1 || busy}
                onClick={() => void load(page - 1)}
              >
                Newer messages
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                className="button button-outline"
                disabled={!data.hasMore || busy}
                onClick={() => void load(page + 1)}
              >
                Older messages
              </button>
            </div>
          )}
          {data.readOnly ? (
            <p>Lost project. Discussions are read-only.</p>
          ) : (
            <form
              ref={form}
              onSubmit={submit}
              className={styles.composer}
              data-unsaved={!!body}
              aria-label="Project comment"
            >
              <label className="sr-only" htmlFor={`comment-body-${project}`}>
                {editing ? "Edit" : "Comment"}
              </label>
              <textarea
                id={`comment-body-${project}`}
                aria-label={editing ? "Edit" : "Comment"}
                name="comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={8000}
                rows={3}
                disabled={saving}
                placeholder="Share an update, ask a question, or type @ to mention..."
              />
              {(inlineMention !== undefined || mentionOpen) && (
                <div
                  className={styles.inlineMentions}
                  role="group"
                  aria-label="Mention suggestions"
                >
                  {mentionOpen && (
                    <input
                      aria-label="Find a team member to mention"
                      placeholder="Search team members…"
                      value={mentionSearch}
                      onChange={(e) => setMentionSearch(e.target.value)}
                    />
                  )}
                  {data.people
                    .filter((p) =>
                      p.display_name
                        .toLowerCase()
                        .includes(
                          (inlineMention ?? mentionSearch).toLowerCase(),
                        ),
                    )
                    .slice(0, 8)
                    .map((person) => (
                      <button
                        type="button"
                        key={person.id}
                        disabled={
                          saving ||
                          (!mentions.includes(person.id) &&
                            mentions.length >= 20)
                        }
                        onClick={() => {
                          setMentions((v) =>
                            v.includes(person.id) ? v : [...v, person.id],
                          );
                          setBody((v) =>
                            inlineMention !== undefined
                              ? v.replace(
                                  /@[^@\n]*$/,
                                  `@${person.display_name} `,
                                )
                              : `${v}${v && !v.endsWith(" ") ? " " : ""}@${person.display_name} `,
                          );
                          setMentionOpen(false);
                          setMentionSearch("");
                          form.current?.querySelector("textarea")?.focus();
                        }}
                      >
                        @{person.display_name}
                      </button>
                    ))}
                  {!data.people.some((p) =>
                    p.display_name
                      .toLowerCase()
                      .includes((inlineMention ?? mentionSearch).toLowerCase()),
                  ) && <span>No eligible team members match.</span>}
                </div>
              )}
              {!!mentions.length && (
                <div
                  className={styles.mentionChips}
                  aria-label="Selected mentions"
                >
                  {mentions.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={`Remove mention ${data.people.find((p) => p.id === id)?.display_name ?? "Project member"}`}
                      onClick={() =>
                        setMentions((v) => v.filter((x) => x !== id))
                      }
                    >
                      @
                      {data.people.find((p) => p.id === id)?.display_name ??
                        "Project member"}{" "}
                      ×
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.composerActions}>
                <label className={styles.contextSelector}>
                  <Layers size={16} aria-hidden="true" />
                  <span className="sr-only">Discussion context</span>
                  <select
                    aria-label="Discussion context"
                    name="commentSpace"
                    value={space}
                    disabled={!!editing || saving}
                    onChange={(e) => setSpace(e.target.value)}
                  >
                    <option value="">Project Discussion</option>
                    {data.spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.mentionTrigger}
                  aria-label="Mention a team member"
                  aria-expanded={mentionOpen}
                  onClick={() => setMentionOpen((v) => !v)}
                  disabled={saving}
                >
                  <AtSign size={20} aria-hidden="true" />
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving || !body.trim() || mentions.length > 20}
                >
                  {saving ? "Posting…" : editing ? "Save changes" : "Post"}
                  <Send size={16} aria-hidden="true" />
                </button>
                {editing && (
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (!window.confirm("Discard this edit?")) return;
                      setEditing(null);
                      setBody("");
                      setMentions([]);
                      setSpace("");
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
              {success && (
                <p role="status" className="form-success">
                  {success}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </Container>
  );
}
