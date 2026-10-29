"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Category, ChatSummary } from "@nyay/shared";
import { Modal } from "@/components/Modal";
import { HttpError, api } from "@/lib/api";
import { CATEGORY_LABEL, LANGUAGE_LABEL, plural, relativeStamp } from "@/lib/format";
import styles from "./chats.module.css";

const IST = "Asia/Kolkata";
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Filter = "all" | "pinned" | Category;
type Bucket = "today" | "week" | "month" | "older";

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Earlier this week" },
  { id: "month", label: "Last month" },
  { id: "older", label: "Earlier" },
];

function istDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(date);
}

function shiftDay(ymd: string, days: number): string {
  const next = new Date(`${ymd}T12:00:00+05:30`);
  next.setTime(next.getTime() + days * 86_400_000);
  return istDay(next);
}

function weekStart(date: Date): string {
  const ymd = istDay(date);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(date);
  const idx = WEEK.indexOf(weekday);
  return shiftDay(ymd, -(idx < 0 ? 0 : idx));
}

function monthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: IST, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function previousMonth(now: Date): string {
  const [year, month] = monthKey(now).split("-").map(Number);
  if (!year || !month) return "";
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return `${prev.year}-${String(prev.month).padStart(2, "0")}`;
}

function bucketOf(iso: string, now: Date): Bucket {
  const when = new Date(iso);
  if (istDay(when) === istDay(now)) return "today";
  if (weekStart(when) === weekStart(now)) return "week";
  if (monthKey(when) === previousMonth(now)) return "month";
  return "older";
}

function draftLabel(status: ChatSummary["draft_status"]): string | null {
  if (status === "sent") return "Draft sent";
  if (status === "ready") return "Draft ready";
  if (status === "draft") return "Draft saved";
  return null;
}

export function ChatList({ initial }: { initial: ChatSummary[] }) {
  const router = useRouter();
  const [base, setBase] = useState(initial);
  const [remote, setRemote] = useState<ChatSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [removing, setRemoving] = useState<ChatSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const active = query.trim() !== "" || filter !== "all";
  const items = remote ?? base;
  const pinnedCount = base.filter((c) => c.pinned).length;
  const counts = new Map<Category, number>();
  for (const chat of base) counts.set(chat.category, (counts.get(chat.category) ?? 0) + 1);

  function mapBoth(fn: (chat: ChatSummary) => ChatSummary | null) {
    const apply = (list: ChatSummary[]) => list.flatMap((chat) => {
      const next = fn(chat);
      return next ? [next] : [];
    });
    setBase(apply);
    setRemote((list) => (list ? apply(list) : list));
  }

  async function load(nextQuery: string, nextFilter: Filter) {
    const q = nextQuery.trim();
    if (!q && nextFilter === "all") {
      setRemote(null);
      setPending(false);
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const rows = await api.listChats({
        ...(q ? { q } : {}),
        ...(nextFilter === "pinned" ? { pinned: true } : {}),
        ...(nextFilter !== "all" && nextFilter !== "pinned" ? { category: nextFilter } : {}),
      });
      setRemote(rows);
    } catch (err) {
      setNotice(err instanceof HttpError ? err.message : "Could not load chats.");
    } finally {
      setPending(false);
    }
  }

  function onSearch(value: string) {
    setQuery(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(value, filter), 300);
  }

  function onFilter(next: Filter) {
    setFilter(next);
    if (timer.current) window.clearTimeout(timer.current);
    void load(query, next);
  }

  async function togglePin(chat: ChatSummary) {
    const next = !chat.pinned;
    mapBoth((item) => (item.id === chat.id ? { ...item, pinned: next } : item));
    try {
      const saved = await api.updateChat(chat.id, { pinned: next });
      mapBoth((item) => (item.id === chat.id ? { ...item, ...saved, pinned: next } : item));
      if (filter === "pinned" && !next) setRemote((list) => list?.filter((item) => item.id !== chat.id) ?? list);
    } catch (err) {
      mapBoth((item) => (item.id === chat.id ? { ...item, pinned: chat.pinned } : item));
      setNotice(err instanceof HttpError ? err.message : "Could not update that chat.");
    }
  }

  async function saveTitle(chat: ChatSummary, title: string) {
    const trimmed = title.trim().slice(0, 80);
    setEditing(null);
    if (!trimmed || trimmed === chat.title) return;
    mapBoth((item) => (item.id === chat.id ? { ...item, title: trimmed } : item));
    try {
      await api.updateChat(chat.id, { title: trimmed });
    } catch (err) {
      mapBoth((item) => (item.id === chat.id ? { ...item, title: chat.title } : item));
      setNotice(err instanceof HttpError ? err.message : "Could not rename that chat.");
    }
  }

  async function confirmDelete() {
    if (!removing) return;
    setBusy(true);
    try {
      await api.deleteChat(removing.id);
      const id = removing.id;
      mapBoth((item) => (item.id === id ? null : item));
      setRemoving(null);
    } catch (err) {
      setNotice(err instanceof HttpError ? err.message : "Could not delete that chat.");
    } finally {
      setBusy(false);
    }
  }

  if (base.length === 0 && !active) {
    return (
      <div className={styles.empty}>
        <h2>Start your first chat</h2>
        <p>Ask a question and NYAY-SUTRA keeps the answer here, with the context from the day you asked.</p>
        <Link href="/ask?new=1" className="btn-primary">
          + New chat
        </Link>
      </div>
    );
  }

  const pinned = filter === "pinned" ? [] : items.filter((chat) => chat.pinned);
  const rest = items.filter((chat) => (filter === "pinned" ? true : !chat.pinned));
  const now = new Date();
  const groups = BUCKETS.map((bucket) => ({
    ...bucket,
    chats: rest.filter((chat) => bucketOf(chat.last_activity_at, now) === bucket.id),
  })).filter((group) => group.chats.length > 0);
  const noun = base.length === 1 ? "chat" : "chats";

  return (
    <>
      <div className={styles.top}>
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            placeholder={`Search across ${base.length} ${noun}`}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search chats"
          />
        </label>
        <Link href="/ask?new=1" className="btn-primary">
          + New chat
        </Link>
      </div>

      <div className={styles.filters} role="toolbar" aria-label="Filter chats">
        <FilterChip current={filter} id="all" onSelect={onFilter}>
          All ({base.length})
        </FilterChip>
        {pinnedCount > 0 && (
          <FilterChip current={filter} id="pinned" onSelect={onFilter}>
            Pinned ({pinnedCount})
          </FilterChip>
        )}
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((category) => {
          const count = counts.get(category) ?? 0;
          if (!count) return null;
          return (
            <FilterChip key={category} current={filter} id={category} onSelect={onFilter}>
              {CATEGORY_LABEL[category]} ({count})
            </FilterChip>
          );
        })}
      </div>

      {pending && (
        <p className={styles.status} role="status">
          Loading chats…
        </p>
      )}
      {notice && (
        <p className={styles.alert} role="alert">
          {notice}
        </p>
      )}

      {!pending && active && items.length === 0 && (
        <div className={styles.empty}>
          <h2>{query.trim() ? `No chats match '${query.trim()}'.` : "No chats in this filter."}</h2>
          <p>Try a different word or start a new chat.</p>
          <Link href="/ask?new=1" className="btn-secondary">
            + New chat
          </Link>
        </div>
      )}

      {filter === "pinned" && items.length > 0 && (
        <section>
          <SectionLabel>Pinned</SectionLabel>
          <div className={styles.list}>
            {items.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                editing={editing}
                onOpen={() => router.push(`/ask/results/${chat.id}`)}
                onPin={() => void togglePin(chat)}
                onEdit={() => setEditing({ id: chat.id, title: chat.title })}
                onTitle={(title) => setEditing({ id: chat.id, title })}
                onSave={(title) => void saveTitle(chat, title)}
                onCancel={() => setEditing(null)}
                onDelete={() => setRemoving(chat)}
              />
            ))}
          </div>
        </section>
      )}

      {filter !== "pinned" && pinned.length > 0 && (
        <section>
          <SectionLabel>Pinned</SectionLabel>
          <div className={styles.list}>
            {pinned.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                editing={editing}
                onOpen={() => router.push(`/ask/results/${chat.id}`)}
                onPin={() => void togglePin(chat)}
                onEdit={() => setEditing({ id: chat.id, title: chat.title })}
                onTitle={(title) => setEditing({ id: chat.id, title })}
                onSave={(title) => void saveTitle(chat, title)}
                onCancel={() => setEditing(null)}
                onDelete={() => setRemoving(chat)}
              />
            ))}
          </div>
        </section>
      )}

      {filter !== "pinned" &&
        groups.map((group) => (
          <section key={group.id}>
            <SectionLabel>{group.label}</SectionLabel>
            <div className={styles.list}>
              {group.chats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  editing={editing}
                  onOpen={() => router.push(`/ask/results/${chat.id}`)}
                  onPin={() => void togglePin(chat)}
                  onEdit={() => setEditing({ id: chat.id, title: chat.title })}
                  onTitle={(title) => setEditing({ id: chat.id, title })}
                  onSave={(title) => void saveTitle(chat, title)}
                  onCancel={() => setEditing(null)}
                  onDelete={() => setRemoving(chat)}
                />
              ))}
            </div>
          </section>
        ))}

      {removing && (
        <Modal title="Delete this chat?" onClose={() => setRemoving(null)}>
          <p>Drafts generated from this chat will remain.</p>
          <div className={styles.modalActions}>
            <button type="button" className="btn-secondary" onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" data-autofocus disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function FilterChip({
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

function SectionLabel({ children }: { children: string }) {
  return (
    <div className={styles.section}>
      <span>{children}</span>
      <span className={styles.sectionLine} />
    </div>
  );
}

function ChatRow({
  chat,
  editing,
  onOpen,
  onPin,
  onEdit,
  onTitle,
  onSave,
  onCancel,
  onDelete,
}: {
  chat: ChatSummary;
  editing: { id: string; title: string } | null;
  onOpen: () => void;
  onPin: () => void;
  onEdit: () => void;
  onTitle: (title: string) => void;
  onSave: (title: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const isEditing = editing?.id === chat.id;
  const place = [chat.context.state, chat.context.city].filter(Boolean).join(" · ");
  const draft = draftLabel(chat.draft_status);
  const meta = [plural(chat.follow_ups, "follow-up"), `${plural(chat.sources, "source")} cited`, draft].filter(Boolean);

  return (
    <article
      className={`${styles.row} ${chat.pinned ? styles.rowPinned : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input")) return;
        onOpen();
      }}
    >
      <div className={styles.rowMain}>
        <span className="cat-pill">{CATEGORY_LABEL[chat.category]}</span>
        {isEditing ? (
          <input
            className={styles.rename}
            value={editing.title}
            maxLength={80}
            aria-label="Chat title"
            autoFocus
            onChange={(e) => onTitle(e.target.value)}
            onBlur={() => onSave(editing.title)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave(editing.title);
              }
              if (e.key === "Escape") onCancel();
            }}
          />
        ) : (
          <Link href={`/ask/results/${chat.id}`} className={styles.title}>
            {chat.title}
          </Link>
        )}
        <div className={styles.ctx}>
          {place && <span>{place}</span>}
          <span>{LANGUAGE_LABEL[chat.context.language]}</span>
          {chat.context.age != null && <span>Age {chat.context.age}</span>}
        </div>
        {chat.snippet && <p className={styles.snippet}>{chat.snippet}</p>}
        <p className={styles.meta}>{meta.join(" · ")}</p>
      </div>
      <div className={styles.actions}>
        <time className={styles.time} dateTime={chat.last_activity_at}>
          {relativeStamp(chat.last_activity_at)}
        </time>
        <div className={styles.actionRow}>
          <button type="button" className={styles.iconBtn} aria-pressed={chat.pinned} aria-label={chat.pinned ? "Unpin" : "Pin"} onClick={onPin}>
            {chat.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Rename" onClick={onEdit}>
            Rename
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Delete" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
