"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ChatMessage } from "@nyay/shared";
import { ttsUrl } from "@/lib/api";
import { CATEGORY_LABEL, LANGUAGE_LABEL, plural } from "@/lib/format";
import styles from "./ask.module.css";

function modelLabel(message: ChatMessage): string {
  if (message.model_provider === "offline") return "Offline mode";
  const who = message.model_provider === "groq" ? "Groq" : message.model_provider === "gemini" ? "Google" : "";
  const model = (message.model_name ?? "").replace("-versatile", "");
  return [who, model].filter(Boolean).join(" · ") || "Unavailable";
}

function inline(text: string, onCite: (n: number) => void, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\]|https?:\/\/[^\s)]+)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={`${keyPrefix}-${i}`}>{bold[1]}</strong>;
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    }
    const cite = /^\[(\d+)\]$/.exec(part);
    if (cite) {
      const n = Number(cite[1]);
      return (
        <button key={`${keyPrefix}-${i}`} type="button" className={styles.cite} onClick={() => onCite(n)}>
          [{n}]
        </button>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function AnswerBody({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (!items.length) return;
    const list = items;
    items = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {list.map((item, i) => (
          <li key={i}>{inline(item, onCite, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
  };
  lines.forEach((line) => {
    const item = /^(?:[-*])\s+(.*)$/.exec(line.trim());
    if (item?.[1]) {
      items.push(item[1]);
      return;
    }
    flush();
    const trimmed = line.trim();
    if (trimmed) blocks.push(<p key={`p-${blocks.length}`}>{inline(trimmed, onCite, `p-${blocks.length}`)}</p>);
  });
  flush();
  return <div className={styles.body}>{blocks}</div>;
}

export function AnswerCard({
  chatId,
  message,
  showDraft = true,
  variant = "card",
}: {
  chatId: string;
  message: ChatMessage;
  showDraft?: boolean;
  variant?: "card" | "bubble";
}) {
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"listen" | "copy" | "share" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const language = message.language ?? "english";
  const acts = new Set(message.citations.map((c) => c.act_name));
  const category = message.category ? CATEGORY_LABEL[message.category] : "General";
  const actName = message.citations[0]?.act_name;

  function showCite(n: number) {
    setOpen(true);
    window.setTimeout(() => {
      document.getElementById(`cite-${message.id}-${n}`)?.scrollIntoView({ block: "center" });
    }, 30);
  }

  async function listen() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setBusy(null);
      return;
    }
    setNote(null);
    setBusy("listen");
    const res = await fetch(ttsUrl(message.content, language));
    if (!res.ok) {
      setBusy(null);
      setNote(
        res.status === 503
          ? "Voice playback is not switched on for this server yet. The answer stays on screen."
          : "Could not play audio right now.",
      );
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      audioRef.current = null;
      setBusy(null);
    };
    try {
      await audio.play();
    } catch {
      setBusy(null);
      setNote("Could not play audio right now.");
    }
  }

  async function copyText(kind: "copy" | "share") {
    const value = kind === "copy" ? message.content : `${window.location.origin}/ask/results/${chatId}`;
    try {
      await navigator.clipboard.writeText(value);
      setBusy(kind);
      setNote(kind === "copy" ? "Answer copied." : "Link copied.");
      window.setTimeout(() => setBusy((current) => (current === kind ? null : current)), 1600);
    } catch {
      setNote(kind === "copy" ? "Could not copy the answer." : "Could not copy the link.");
    }
  }

  const latency = message.latency_ms != null ? `answered in ${(message.latency_ms / 1000).toFixed(1)}s` : null;
  const meta = [
    latency,
    modelLabel(message),
    `${plural(message.citations.length, "source")} cited`,
    message.confidence != null ? `confidence ${message.confidence.toFixed(2)}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <article className={variant === "bubble" ? `${styles.answer} ${styles.bubble}` : styles.answer}>
      <div className={styles.answerHead}>
        <span className={styles.answerCat}>
          <span className={styles.sessionDot} aria-hidden="true" />
          {category}
          {actName ? ` / ${actName}` : ""}
        </span>
        <div className={styles.iconRow}>
          <button type="button" className={styles.iconBtn} aria-label={busy === "listen" ? "Stop reading" : "Listen to answer"} aria-pressed={busy === "listen"} onClick={() => void listen()}>
            {busy === "listen" ? "■" : "▶"}
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Copy answer" onClick={() => void copyText("copy")}>
            ⎘
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Copy link to this chat" onClick={() => void copyText("share")}>
            ↗
          </button>
        </div>
      </div>

      <AnswerBody text={message.content} onCite={showCite} />

      {message.citations.length > 0 && (
        <div className={styles.sources}>
          <button type="button" className={styles.sourceToggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span>{open ? "Hide sources" : "View sources"}</span>
            <span className={styles.sourceCount}>
              {plural(acts.size, "act")} · {plural(message.citations.length, "section")}
            </span>
          </button>
          {open && (
            <div className={styles.sourceList}>
              {message.citations.map((c) => (
                <div key={`${c.act_id}-${c.section}-${c.index}`} id={`cite-${message.id}-${c.index}`} className={styles.source}>
                  <span className={styles.sourceNum}>[{c.index}]</span>
                  <div>
                    <div className={styles.sourceTitle}>
                      {c.source_url ? (
                        <a href={c.source_url} target="_blank" rel="noopener noreferrer">
                          {c.act_name}
                        </a>
                      ) : (
                        c.act_name
                      )}
                    </div>
                    <div className={styles.sourceSection}>
                      Section {c.section}
                      {c.section_title ? ` · ${c.section_title}` : ""}
                    </div>
                    {c.excerpt && <div className={styles.sourceExcerpt}>&ldquo;{c.excerpt}&rdquo;</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showDraft && (
        <div className={styles.draft}>
          <div>
            <h3>Generate complaint draft</h3>
            <p>A notice in {LANGUAGE_LABEL[language]}, ready to edit and download, using this answer and its citations.</p>
          </div>
          <Link href={`/drafts/new?fromChatId=${chatId}`}>Draft notice &rarr;</Link>
        </div>
      )}

      <div className={styles.answerMeta}>{meta.join(" · ")}</div>
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
    </article>
  );
}
