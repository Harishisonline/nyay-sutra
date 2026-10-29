"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatDetail, ChatMessage, Language } from "@nyay/shared";
import { BrandLogo } from "@/components/BrandLogo";
import { HttpError, api } from "@/lib/api";
import { LANGUAGE_LABEL, formatDateTime, formatTime, relativeDay, shortId } from "@/lib/format";
import { AnswerCard } from "../../AnswerCard";
import styles from "../../ask.module.css";
import { useVoiceCapture } from "../../useVoiceCapture";

const FOLLOW_LANG: { id: Language; label: string }[] = [
  { id: "english", label: "EN" },
  { id: "hinglish", label: "HI+EN" },
  { id: "marathi", label: "MR" },
  { id: "hindi", label: "HI" },
];

function when(iso: string): string {
  return `${relativeDay(iso)} · ${formatTime(iso)}`;
}

export function Session({ chat }: { chat: ChatDetail }) {
  const router = useRouter();
  const ordered = [...chat.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastVerified = [...ordered].reverse().find((m) => m.role === "assistant" && !m.was_low_confidence);
  const lastAssistant = [...ordered].reverse().find((m) => m.role === "assistant");
  const [language, setLanguage] = useState<Language>(chat.context.language);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const voice = useVoiceCapture(language, (result) => setText(result.text.slice(0, 500)));
  const endRef = useRef<HTMLDivElement>(null);
  const seen = useRef(ordered.length);

  useEffect(() => {
    if (ordered.length > seen.current) endRef.current?.scrollIntoView({ block: "end" });
    seen.current = ordered.length;
  }, [ordered.length]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/ask/results/${chat.id}`);
      setCopied("copied");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  async function submit(question: string) {
    const trimmed = question.trim();
    if (trimmed.length < 5) {
      setError("Ask a follow-up of at least 5 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.query({
        question: trimmed.slice(0, 500),
        language,
        chat_id: chat.id,
        ...(voice.heard
          ? { transcript_language: voice.heard.language, transcript_confidence: voice.heard.confidence }
          : {}),
      });
      voice.setHeard(null);
      setText("");
      if (res.status === "low_confidence") {
        router.push(`/ask/results/${res.chat_id}/error`);
        return;
      }
      router.refresh();
      setSubmitting(false);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof HttpError ? err.message : "Could not send that follow-up. Try again.");
    }
  }

  const place = [chat.context.state, chat.context.city].filter(Boolean).join(" · ");
  const lockedLabel = formatDateTime(chat.context.frozen_at);
  const turns = ordered.map((message, index) => {
    const day = relativeDay(message.created_at);
    const previous = index > 0 ? relativeDay(ordered[index - 1]?.created_at ?? message.created_at) : "";
    return { message, divider: previous && day !== previous ? day : null };
  });

  return (
    <>
      <div className={styles.contextBar}>
        <div className={`container ${styles.contextRow}`}>
          <Link href="/chats" className={styles.backLink}>
            ← All chats
          </Link>
          <button type="button" className={styles.chatId} onClick={() => void copyId()}>
            /ask/results/{shortId(chat.id)}
          </button>
          {copied && (
            <span className={styles.copyNote} role="status">
              {copied === "copied" ? "Copied" : "Could not copy"}
            </span>
          )}
          <div className={styles.contextChips}>
            {place && <span className={styles.ctxChip}>{place}</span>}
            <span className={styles.ctxChip}>{LANGUAGE_LABEL[chat.context.language]}</span>
            {chat.context.age != null && <span className={styles.ctxChip}>Age {chat.context.age}</span>}
            <span className={`${styles.ctxChip} ${styles.ctxLock}`}>Context locked {lockedLabel}</span>
          </div>
        </div>
      </div>

      <div className={styles.wrap}>
        <div className={styles.thread}>
          {turns.map(({ message, divider }) => (
              <div key={message.id} className={styles.turn}>
                {divider && <div className={styles.dayDivider}>{divider}</div>}
                {message.role === "user" ? (
                  <UserBubble message={message} />
                ) : message.was_low_confidence ? (
                  <Unverified message={message} chatId={chat.id} link={message.id === lastAssistant?.id} />
                ) : (
                  <div className={styles.msgAi}>
                    <BrandLogo size="mark" decorative />
                    <AnswerCard
                      chatId={chat.id}
                      message={message}
                      variant="bubble"
                      showDraft={message.id === lastVerified?.id}
                    />
                  </div>
                )}
              </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          className={styles.follow}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          {voice.phase === "recording" && (
            <p className={styles.note} role="status">
              Recording · {voice.elapsed}s. Tap the microphone again to stop.
            </p>
          )}
          {voice.phase === "transcribing" && (
            <p className={styles.note} role="status">
              Transcribing…
            </p>
          )}
          <div className={styles.followRow}>
            <input
              aria-label="Follow-up question"
              maxLength={500}
              placeholder="Ask a follow-up in this chat…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className={styles.pills} role="radiogroup" aria-label="Language for this follow-up">
              {FOLLOW_LANG.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  className={styles.pill}
                  aria-checked={language === item.id}
                  onClick={() => setLanguage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.followMic}
              aria-label={voice.phase === "recording" ? "Stop recording" : "Speak a follow-up"}
              onClick={() => (voice.phase === "recording" ? voice.stop() : void voice.start())}
            >
              <span aria-hidden="true">&#127908;</span>
            </button>
            <button type="submit" className={styles.followSend} disabled={submitting || text.trim().length < 5}>
              {submitting ? "Asking…" : "Ask →"}
            </button>
          </div>
          {(error || voice.error) && (
            <p className={styles.alert} role="alert">
              {error ?? voice.error}
            </p>
          )}
        </form>
      </div>
    </>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={styles.msgUser}>
      <div className={styles.userBubble}>{message.content}</div>
      <div className={styles.msgMeta}>You · {when(message.created_at)}</div>
    </div>
  );
}

function Unverified({ message, chatId, link }: { message: ChatMessage; chatId: string; link: boolean }) {
  return (
    <div className={styles.msgAi}>
      <BrandLogo size="mark" decorative />
      <div className={styles.unverified}>
        <p>NYAY-SUTRA could not verify this answer.</p>
        <div className={styles.msgMeta}>
          {when(message.created_at)}
          {link && (
            <>
              {" · "}
              <Link href={`/ask/results/${chatId}/error`}>See why</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
