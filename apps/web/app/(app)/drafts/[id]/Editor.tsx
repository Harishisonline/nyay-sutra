"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Draft, DraftVersion, ImproveAction } from "@nyay/shared";
import { Modal } from "@/components/Modal";
import { HttpError, api, draftDownloadUrl } from "@/lib/api";
import { LANGUAGE_LABEL, STATUS_LABEL, formatDateTime } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import styles from "../drafts.module.css";

const ACTIONS: { id: ImproveAction; label: string }[] = [
  { id: "regenerate", label: "Regenerate" },
  { id: "make_formal", label: "Make formal" },
  { id: "make_simpler", label: "Make simpler" },
  { id: "add_citations", label: "Add citations" },
];

export function Editor({ initial }: { initial: Draft }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [recipient, setRecipient] = useState(initial.recipient ?? "");
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [body, setBody] = useState(initial.body);
  const [tab, setTab] = useState<"edit" | "preview" | "history">("edit");
  const [versions, setVersions] = useState<DraftVersion[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [improving, setImproving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = draft.status === "sent";
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function save(
    patch: { title?: string; recipient?: string; subject?: string; body?: string },
    retry = true,
  ) {
    setSaveState("saving");
    setNotice(null);
    try {
      const saved = await api.updateDraft(draft.id, patch);
      setDraft(saved);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setNotice(
        err instanceof HttpError
          ? err.message
          : retry
            ? "Could not save. Will retry in 5s."
            : "Could not save. Edit the draft and try again.",
      );
      if (retry) window.setTimeout(() => void save(patch, false), 5000);
    }
  }

  function queueBody(next: string) {
    setBody(next);
    if (locked) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save({ body: next }), 1000);
  }

  async function improve(action: ImproveAction, custom?: string) {
    setImproving(true);
    setNotice(null);
    try {
      const saved = await api.improveDraft(draft.id, { action, ...(custom ? { prompt: custom } : {}) });
      setDraft(saved);
      setBody(saved.body);
      setVersions(null);
      setSaveState("saved");
    } catch (err) {
      setNotice(err instanceof HttpError ? err.message : "Could not improve. Your draft is unchanged. Try again or edit manually.");
    } finally {
      setImproving(false);
    }
  }

  async function openHistory() {
    setTab("history");
    if (versions) return;
    try {
      setVersions(await api.draftVersions(draft.id));
    } catch (err) {
      setNotice(err instanceof HttpError ? err.message : "Could not load history.");
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteDraft(draft.id);
      router.push("/drafts");
    } catch (err) {
      setBusy(false);
      setNotice(err instanceof HttpError ? err.message : "Could not delete that draft.");
    }
  }

  async function markReady() {
    const saved = await api.updateDraft(draft.id, { status: "ready" });
    setDraft(saved);
    setSaveState("saved");
  }

  return (
    <div className={styles.editorPage}>
      <div className={`container ${styles.editorBar}`}>
        <Link href="/drafts" className={styles.back}>
          ← All drafts
        </Link>
        <input
          className={styles.titleInput}
          aria-label="Draft title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => {
            const next = e.currentTarget.value.trim();
            if (next && next !== draft.title) void save({ title: next });
          }}
        />
        <span className={draft.status === "sent" ? styles.sent : styles.pill}>{STATUS_LABEL[draft.status]}</span>
        <span className={styles.saveState} role="status">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : ""}
        </span>
        <div className={styles.barActions}>
          <Link href={`/drafts/${draft.id}/print`} target="_blank" className="btn-secondary">
            View as PDF
          </Link>
          <PrintButton className="btn-secondary" />
          <a className="btn-primary" href={draftDownloadUrl(draft.id)}>
            Download draft →
          </a>
        </div>
      </div>

      <div className={`container ${styles.editorGrid}`}>
        <section className={styles.pane}>
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")}>
              Edit
            </button>
            <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </button>
            <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => void openHistory()}>
              History
            </button>
          </div>

          {tab === "edit" && (
            <div className={styles.fields}>
              <label>
                To
                <textarea
                  rows={3}
                  value={recipient}
                  disabled={locked}
                  onChange={(e) => setRecipient(e.target.value)}
                  onBlur={() => {
                    if ((draft.recipient ?? "") !== recipient) void save({ recipient });
                  }}
                />
              </label>
              <label>
                Subject
                <input
                  value={subject}
                  disabled={locked}
                  onChange={(e) => setSubject(e.target.value)}
                  onBlur={() => {
                    if ((draft.subject ?? "") !== subject) void save({ subject });
                  }}
                />
              </label>
              <label>
                Body
                <textarea rows={16} value={body} disabled={locked} onChange={(e) => queueBody(e.target.value)} />
              </label>
              <p className={styles.meta}>{LANGUAGE_LABEL[draft.language]}</p>
            </div>
          )}

          {tab === "preview" && <div className={`${styles.preview} print-body`}>{body}</div>}

          {tab === "history" && (
            <ul className={styles.history}>
              {(versions ?? []).map((version) => (
                <li key={version.id}>
                  <strong>{version.source.replaceAll("_", " ")}</strong>
                  <span>{formatDateTime(version.created_at)}</span>
                  <p>{version.body.replace(/\s+/g, " ").slice(0, 180)}</p>
                </li>
              ))}
              {versions && versions.length === 0 && <li>No earlier versions yet.</li>}
            </ul>
          )}

          {notice && (
            <p className={styles.alert} role="alert">
              {notice}
            </p>
          )}

          <div className={styles.footerBar}>
            {!locked && draft.status === "draft" && (
              <button type="button" className="btn-secondary" onClick={() => void markReady()}>
                Mark ready
              </button>
            )}
            <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete draft
            </button>
          </div>
        </section>

        <aside className={styles.side}>
          <h2>AI Improve</h2>
          <div className={styles.improve}>
            {ACTIONS.map((action) => (
              <button key={action.id} type="button" disabled={locked || improving} onClick={() => void improve(action.id)}>
                {action.label}
              </button>
            ))}
          </div>
          <label className={styles.custom}>
            Custom instruction
            <textarea rows={3} value={prompt} disabled={locked} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={locked || improving || prompt.trim().length < 3}
            onClick={() => void improve("custom", prompt.trim())}
          >
            {improving ? "Working…" : "Run"}
          </button>
          {locked && <p className={styles.meta}>This draft was marked as sent. The title can still be renamed.</p>}

          {draft.source_chat_id && (
            <p className={styles.source}>
              Source chat: <Link href={`/ask/results/${draft.source_chat_id}`}>{draft.source_chat_title || "Open chat"}</Link>
            </p>
          )}

          {draft.citations.length > 0 && (
            <div className={styles.cites}>
              <h2>Citations</h2>
              <ul>
                {draft.citations.map((cite) => (
                  <li key={`${cite.act_id}-${cite.section}`}>
                    {cite.source_url ? (
                      <a href={cite.source_url} target="_blank" rel="noopener noreferrer">
                        {cite.act_name}, section {cite.section}
                      </a>
                    ) : (
                      <span>
                        {cite.act_name}, section {cite.section}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {confirmDelete && (
        <Modal title="Delete this draft?" onClose={() => setConfirmDelete(false)}>
          <p>The draft is hidden from your list. A downloaded copy on your computer is not affected.</p>
          <div className={styles.modalActions}>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" data-autofocus disabled={busy} onClick={() => void remove()}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
