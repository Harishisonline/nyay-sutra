"use client";

import { useState } from "react";
import { HttpError, api } from "@/lib/api";
import styles from "../../../ask.module.css";

export function TracePanel({ chatId, messageId }: { chatId: string; messageId: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (text) return;
    try {
      const trace = await api.chatTrace(chatId);
      setText(JSON.stringify(trace, null, 2));
    } catch (err) {
      setText(err instanceof HttpError && err.status === 410 ? "Trace expired (24h retention)." : "The trace is not available.");
    }
  }

  async function report() {
    if (!messageId) return;
    try {
      await api.reportMessage(chatId, messageId);
      setReported(true);
      setNote("Reported. Thanks for the feedback.");
    } catch (err) {
      setNote(err instanceof HttpError ? err.message : "Could not file that report.");
    }
  }

  return (
    <div className={styles.choices}>
      <button type="button" className="btn-secondary" onClick={() => void load()}>
        View full trace
      </button>
      {messageId && (
        <button type="button" className="btn-ghost" disabled={reported} onClick={() => void report()}>
          Report this answer as incorrect
        </button>
      )}
      {note && <p role="status">{note}</p>}
      {open && text && (
        <pre className={styles.preview} style={{ whiteSpace: "pre-wrap", maxWidth: "100%", overflow: "auto" }}>
          {text}
        </pre>
      )}
    </div>
  );
}
