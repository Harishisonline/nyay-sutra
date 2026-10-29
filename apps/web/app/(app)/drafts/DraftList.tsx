"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Category, Draft, DraftStatus } from "@nyay/shared";
import { Modal } from "@/components/Modal";
import { HttpError, api, draftDownloadUrl } from "@/lib/api";
import { CATEGORY_LABEL, LANGUAGE_LABEL, STATUS_LABEL, formatShortDate } from "@/lib/format";
import styles from "./drafts.module.css";

type Filter = "all" | DraftStatus | Category;

export function DraftList({ initial }: { initial: Draft[] }) {
  const [base, setBase] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = {
    all: base.length,
    draft: base.filter((d) => d.status === "draft").length,
    ready: base.filter((d) => d.status === "ready").length,
    sent: base.filter((d) => d.status === "sent").length,
  };
  const categories = new Map<Category, number>();
  for (const draft of base) categories.set(draft.category, (categories.get(draft.category) ?? 0) + 1);

  async function apply(next: Filter) {
    setFilter(next);
    setPending(true);
    setNotice(null);
    try {
      const rows = await api.listDrafts(
        next === "all"
          ? {}
          : next === "draft" || next === "ready" || next === "sent"
            ? { status: next }
            : { category: next },
      );
      if (next === "all") setBase(rows);
      setShown(rows);
    } catch (err) {
      setNotice(err instanceof HttpError ? err.message : "Could not load drafts.");
    } finally {
      setPending(false);
    }
  }

  async function confirmSent() {
    if (!sending) return;
    setBusy(true);
    try {
      const saved = await api.markSent(sending.id);
      const swap = (list: Draft[]) => list.map((d) => (d.id === saved.id ? saved : d));
      setBase(swap);
      setShown(swap);
      setSending(null);
    } catch (err) {
      setNotice(err instanceof HttpError ? err.message : "Could not mark that draft as sent.");
    } finally {
      setBusy(false);
    }
  }

  if (base.length === 0 && filter === "all" && !pending) {
    return (
      <div className={styles.empty}>
        <h2>Start your first complaint draft</h2>
        <p>Pick a template, or turn a verified answer into a notice you can edit and download.</p>
        <Link href="/drafts/new" className="btn-primary">
          + New draft
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.top}>
        <div className={styles.filters} role="toolbar" aria-label="Filter drafts">
          <Chip current={filter} id="all" onSelect={(id) => void apply(id)}>
            All ({counts.all})
          </Chip>
          <Chip current={filter} id="draft" onSelect={(id) => void apply(id)}>
            Drafts ({counts.draft})
          </Chip>
          {counts.ready > 0 && (
            <Chip current={filter} id="ready" onSelect={(id) => void apply(id)}>
              Ready ({counts.ready})
            </Chip>
          )}
          <Chip current={filter} id="sent" onSelect={(id) => void apply(id)}>
            Sent ({counts.sent})
          </Chip>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((category) => {
            const count = categories.get(category) ?? 0;
            if (!count) return null;
            return (
              <Chip key={category} current={filter} id={category} onSelect={(id) => void apply(id)}>
                {CATEGORY_LABEL[category]} ({count})
              </Chip>
            );
          })}
        </div>
        <Link href="/drafts/new" className="btn-primary">
          + New draft
        </Link>
      </div>

      {pending && (
        <p className={styles.status} role="status">
          Loading drafts…
        </p>
      )}
      {notice && (
        <p className={styles.alert} role="alert">
          {notice}
        </p>
      )}
      {!pending && shown.length === 0 && (
        <div className={styles.empty}>
          <h2>No drafts in this category yet.</h2>
          <Link href="/drafts/new" className="btn-secondary">
            + New draft
          </Link>
        </div>
      )}

      <div className={styles.list}>
        {shown.map((draft) => (
          <article key={draft.id} className={styles.card}>
            <div className={styles.cardMain}>
              <span className="cat-pill">{CATEGORY_LABEL[draft.category]}</span>
              <Link href={`/drafts/${draft.id}`} className={styles.title}>
                {draft.title}
              </Link>
              <p className={styles.excerpt}>{draft.body.replace(/\s+/g, " ").trim()}</p>
              <p className={styles.meta}>
                <span className={draft.status === "sent" ? styles.sent : styles.pill}>{STATUS_LABEL[draft.status]}</span>
                <span>{LANGUAGE_LABEL[draft.language]}</span>
                <span>{formatShortDate(draft.updated_at)}</span>
              </p>
            </div>
            <div className={styles.actions}>
              <Link href={`/drafts/${draft.id}`} className={styles.iconBtn}>
                Edit
              </Link>
              <a className={styles.iconBtn} href={draftDownloadUrl(draft.id, "pdf")}>
                Download
              </a>
              {draft.status !== "sent" && (
                <button type="button" className={styles.iconBtn} onClick={() => setSending(draft)}>
                  Send
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {sending && (
        <Modal title="Mark as sent?" onClose={() => setSending(null)}>
          <p>You will not be able to edit this draft after sending.</p>
          <div className={styles.modalActions}>
            <button type="button" className="btn-secondary" onClick={() => setSending(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" data-autofocus disabled={busy} onClick={() => void confirmSent()}>
              {busy ? "Saving…" : "Mark as sent"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Chip({
  current,
  id,
  onSelect,
  children,
}: {
  current: Filter;
  id: Filter;
  onSelect: (id: Filter) => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={current === id} onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}
