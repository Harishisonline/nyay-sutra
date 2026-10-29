import type { Metadata } from "next";
import Link from "next/link";
import type { ChatDetail, Diagnostic } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import styles from "../../../ask.module.css";
import { TracePanel } from "./TracePanel";

export const metadata: Metadata = { title: "Could not verify" };

export default async function AskErrorPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const path = `/ask/results/${chatId}/error`;
  await requireUser(path);
  const diagnostic = await loadOrHandle<Diagnostic>(`/api/v1/chats/${chatId}/error`, path);
  const chat = await loadOrHandle<ChatDetail>(`/api/v1/chats/${chatId}`, path);
  const failed = [...chat.messages].reverse().find((m) => m.role === "assistant" && m.was_low_confidence);
  const top = diagnostic.retrieval_preview[0];
  const low = diagnostic.retrieval_top_score < diagnostic.threshold;
  const rephrase = `/ask?q=${encodeURIComponent(diagnostic.question)}`;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className="eyebrow-mono">Confidence below threshold</div>
        <h1>NYAY-SUTRA could not verify this answer.</h1>
        <p className={styles.lede}>
          The statutes on this server did not support a cited answer, so nothing was presented as law.
        </p>
      </header>

      <section className={styles.diag} aria-labelledby="why">
        <h2 id="why">Why this happened</h2>
        <dl>
          <div className={styles.diagRow}>
            <dt>Your question</dt>
            <dd>{diagnostic.question}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Retrieval</dt>
            <dd>
              {low ? "Low" : "OK"} · top score {diagnostic.retrieval_top_score.toFixed(3)} · threshold{" "}
              {diagnostic.threshold.toFixed(2)}
            </dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Model</dt>
            <dd>{diagnostic.model_flag ?? "No extra flag"}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Citations</dt>
            <dd>{diagnostic.valid_citations > 0 ? `${diagnostic.valid_citations} checked` : "None the model would stand behind"}</dd>
          </div>
          <div className={styles.diagRow}>
            <dt>Request</dt>
            <dd>{diagnostic.trace_id}</dd>
          </div>
        </dl>
        {diagnostic.retrieval_preview.length > 0 && (
          <ol className={styles.preview}>
            {diagnostic.retrieval_preview.slice(0, 3).map((item) => (
              <li key={`${item.act_id}-${item.section}`}>
                {item.source_url ? (
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                    {item.act_name}, section {item.section}
                  </a>
                ) : (
                  <span>
                    {item.act_name}, section {item.section}
                  </span>
                )}
                {item.title ? ` · ${item.title}` : ""} · score {item.score.toFixed(3)}
              </li>
            ))}
          </ol>
        )}
        <TracePanel chatId={chatId} messageId={failed?.id ?? null} />
      </section>

      <section className={styles.choices} aria-label="What you can do">
        <a className="btn-primary" href="https://nalsa.gov.in/" target="_blank" rel="noopener noreferrer">
          Find a legal aid office
        </a>
        <Link href={rephrase} className="btn-secondary">
          Rephrase the question
        </Link>
        {top?.source_url ? (
          <a className="btn-secondary" href={top.source_url} target="_blank" rel="noopener noreferrer">
            Browse section {top.section}
          </a>
        ) : (
          <Link href="/rights" className="btn-secondary">
            Browse rights
          </Link>
        )}
        <button type="button" className="btn-ghost" disabled>
          Ask the community
        </button>
        <Link href="/home" className="btn-ghost">
          Back to home
        </Link>
      </section>
      <p className={styles.note}>
        If this is urgent, free legal aid is a phone call away. National Legal Services Authority helpline 15100.
      </p>
    </div>
  );
}
