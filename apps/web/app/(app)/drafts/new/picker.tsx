"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import type { DraftTemplate } from "@nyay/shared";
import { createDraftAction } from "../actions";
import styles from "../drafts.module.css";

export function TemplatePicker({ templates }: { templates: { id: DraftTemplate; title: string; body: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(template: DraftTemplate) {
    setBusy(template);
    setError(null);
    try {
      await createDraftAction({ template });
    } catch (err) {
      unstable_rethrow(err);
      setBusy(null);
      setError(err instanceof Error ? err.message : "Could not create that draft.");
    }
  }

  return (
    <>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      <div className={styles.templates}>
        {templates.map((item) => (
          <button key={item.id} type="button" className={styles.template} disabled={busy !== null} onClick={() => void choose(item.id)}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <span>{busy === item.id ? "Creating…" : "Use this template"}</span>
          </button>
        ))}
      </div>
      <p className={styles.skip}>
        <Link href="/drafts/new?blank=1">Skip template</Link>
      </p>
    </>
  );
}

export function CreateDraft({ fromChatId, blank }: { fromChatId?: string; blank: boolean }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createDraftAction(fromChatId ? { from_chat_id: fromChatId } : { template: "generic" }).catch((err: unknown) => {
      unstable_rethrow(err);
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not create that draft.");
    });
    return () => {
      cancelled = true;
    };
  }, [fromChatId, blank]);

  return (
    <p className={error ? styles.alert : styles.status} role={error ? "alert" : "status"}>
      {error ?? "Opening the editor…"}
    </p>
  );
}
