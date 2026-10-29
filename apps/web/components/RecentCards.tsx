import Link from "next/link";
import type { ChatSummary, Draft } from "@nyay/shared";
import { CATEGORY_LABEL, LANGUAGE_LABEL, STATUS_LABEL, plural, relativeDay, relativeStamp } from "@/lib/format";
import styles from "./RecentCards.module.css";

export function RecentChatCard({ chat }: { chat: ChatSummary }) {
  return (
    <Link href={`/ask/results/${chat.id}`} className={styles.card}>
      <span className="cat-pill">{CATEGORY_LABEL[chat.category]}</span>
      <h3 className={styles.title}>{chat.title}</h3>
      <p className={styles.snippet}>{chat.snippet}</p>
      <div className={styles.meta}>
        <span>
          {plural(chat.follow_ups, "follow-up")} · {plural(chat.sources, "source")}
        </span>
        <span>{relativeStamp(chat.last_activity_at)}</span>
      </div>
    </Link>
  );
}

export function RecentDraftCard({ draft }: { draft: Draft }) {
  const excerpt = draft.body.replace(/\s+/g, " ").trim().slice(0, 180);
  return (
    <Link href={`/drafts/${draft.id}`} className={styles.card}>
      <span className="cat-pill">{CATEGORY_LABEL[draft.category]}</span>
      <h3 className={styles.title}>{draft.title}</h3>
      <p className={styles.snippet}>&ldquo;{excerpt}&rdquo;</p>
      <div className={styles.meta}>
        <span className={`status-pill ${draft.status}`}>
          <span className="dot" aria-hidden="true" />
          {STATUS_LABEL[draft.status]}
        </span>
        <span>
          {LANGUAGE_LABEL[draft.language]} · {relativeDay(draft.updated_at)}
        </span>
      </div>
    </Link>
  );
}
