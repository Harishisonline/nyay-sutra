"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language, TranscribeResponse, UserProfile } from "@nyay/shared";
import { HttpError, api } from "@/lib/api";
import { LANGUAGE_LABEL, LANGUAGE_NATIVE } from "@/lib/format";
import styles from "./ask.module.css";
import { useVoiceCapture } from "./useVoiceCapture";

const PLACEHOLDER: Record<Language, string> = {
  english:
    "Example: My landlord is refusing to return my security deposit of Rs 50,000 even though I moved out 3 months ago. What can I do?",
  hinglish: "Example: Mera landlord 3 mahine baad bhi Rs 50,000 security deposit nahi de raha. Main kya kar sakta hoon?",
  marathi: "उदाहरण: मी ३ महिन्यांपूर्वी घर सोडल्यानंतरही घरमालक ₹५०,००० अनामत रक्कम परत देत नाही. मी काय करू शकतो?",
  hindi: "उदाहरण: घर छोड़ने के ३ महीने बाद भी मकान मालिक ₹५०,००० जमानत राशि नहीं लौटा रहा। मैं क्या कर सकता हूँ?",
};

const SUGGESTIONS = [
  { category: "Tenancy", question: "Can my landlord cut water supply if I refuse to pay extra charges?" },
  { category: "Consumer", question: "The hospital charged me Rs 80,000 but my insurance covered only Rs 45,000. Is the balance fair?" },
  { category: "RTI", question: "I applied for a caste certificate 2 months ago and the officer has not replied. How do I file an RTI?" },
  { category: "Women and child", question: "My husband is verbally and financially abusing me. What protection does the law give me?" },
  { category: "Wages", question: "My employer has not paid my salary for 2 months. Can I file a complaint without a lawyer?" },
  { category: "Education", question: "The school denied admission to my 6-year-old under RTE quota. What should I do?" },
] as const;

const PICKER: Language[] = ["english", "marathi", "hindi"];

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function storageHint(user: UserProfile): string {
  if (!user.privacy.save_chat_history) return "This chat is deleted 7 days after the last message.";
  if (user.privacy.anonymous_by_default) return "Saved to your chats. Your name stays off drafts.";
  return "Saved to your chats.";
}

function providerName(provider: TranscribeResponse["provider"]): string {
  return provider === "bhashini" ? "Bhashini" : "Whisper";
}

export function AskComposer({
  user,
  initialQuestion = "",
  chatId,
}: {
  user: UserProfile;
  initialQuestion?: string;
  chatId?: string;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(user.preferred_language);
  const [question, setQuestion] = useState(initialQuestion.slice(0, 500));
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const voice = useVoiceCapture(language, (result) => {
    setQuestion(result.text.slice(0, 500));
    setEditing(false);
  });
  const languages: Language[] = language === "hinglish" || user.preferred_language === "hinglish" ? ["english", "hinglish", "marathi", "hindi"] : PICKER;
  const heard = voice.heard;
  const busy = submitting || voice.phase !== "idle";

  async function chooseLanguage(next: Language) {
    setLanguage(next);
    try {
      await api.updateMe({ preferred_language: next });
    } catch (err) {
      setFormError(err instanceof HttpError ? err.message : "Could not save the language. This question will still use it.");
    }
  }

  async function submit(text: string, transcript?: TranscribeResponse | null) {
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      setFormError("Ask a question of at least 5 characters.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api.query({
        question: trimmed.slice(0, 500),
        language,
        ...(chatId ? { chat_id: chatId } : {}),
        ...(transcript
          ? { transcript_language: transcript.language, transcript_confidence: transcript.confidence }
          : {}),
      });
      router.push(res.status === "low_confidence" ? `/ask/results/${res.chat_id}/error` : `/ask/results/${res.chat_id}`);
    } catch (err) {
      setSubmitting(false);
      setFormError(err instanceof HttpError ? err.message : "Could not send that question. Try again.");
    }
  }

  const error = formError ?? voice.error;
  const words = question.trim() ? question.trim().split(/\s+/).length : 0;

  return (
    <>
      <div className={styles.langWrap}>
        <div className={styles.langPicker} role="radiogroup" aria-label="Answer language">
          {languages.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              className={styles.langOpt}
              aria-checked={language === item}
              disabled={busy}
              onClick={() => void chooseLanguage(item)}
            >
              {LANGUAGE_NATIVE[item]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        {voice.phase === "recording" ? (
          <div className={styles.strip}>
            <button type="button" className={styles.stripMic} aria-label="Stop recording" onClick={voice.stop}>
              <span aria-hidden="true">●</span>
            </button>
            <div className={styles.stripBody}>
              <div className={styles.stripStatus}>
                <span className={styles.recDot} aria-hidden="true" />
                Recording · {LANGUAGE_LABEL[language]}
              </div>
              <p className={styles.live}>
                {voice.live || "Listening"}
                <span className={styles.caret} aria-hidden="true" />
              </p>
              <div className={styles.bars} aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
            <div className={styles.timer}>{clock(voice.elapsed)}</div>
          </div>
        ) : voice.phase === "transcribing" || submitting ? (
          <div className={styles.processing} role="status">
            <span className="spinner" aria-hidden="true" />
            <div>
              <strong>
                {submitting
                  ? "Finding the right law..."
                  : `Transcribing your question in ${LANGUAGE_LABEL[language]}.`}
              </strong>
              <div className={styles.step}>
                {submitting ? "Matching it against the statutes on this server." : "Step 1 of 2 · checking what was heard"}
              </div>
            </div>
          </div>
        ) : heard ? (
          <div className={styles.heard}>
            <div className={styles.heardMark} aria-hidden="true">
              “
            </div>
            <div>
              <div className={styles.heardLabel}>What NYAY-SUTRA heard</div>
              {editing ? (
                <textarea
                  aria-label="Edit the transcript"
                  maxLength={500}
                  value={question}
                  autoFocus
                  onChange={(e) => setQuestion(e.target.value)}
                  onBlur={() => setEditing(false)}
                />
              ) : (
                <p className={styles.heardText}>&ldquo;{question}&rdquo;</p>
              )}
              <div className={styles.heardMeta}>
                <span>
                  {LANGUAGE_LABEL[heard.language]} · {Math.round(heard.confidence * 100)}% confidence · {providerName(heard.provider)}
                </span>
                <span>{words} {words === 1 ? "word" : "words"}</span>
              </div>
            </div>
            <button type="button" className={styles.edit} onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        ) : (
          <div className={styles.field}>
            <textarea
              id="question"
              aria-label="Your question"
              maxLength={500}
              placeholder={PLACEHOLDER[language]}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setFormError(null);
                voice.setError(null);
              }}
            />
            <div className={styles.meta}>
              <span>
                {question.length} / 500 characters
              </span>
              <span>Question · {LANGUAGE_LABEL[language]}</span>
            </div>
          </div>
        )}

        {voice.phase === "idle" && !submitting && (
          <div className={styles.actions}>
            {heard ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  voice.setHeard(null);
                  setQuestion("");
                }}
              >
                Type instead
              </button>
            ) : (
              <span className={styles.hint}>{storageHint(user)}</span>
            )}
            <button type="button" className="btn-primary" disabled={question.trim().length < 5} onClick={() => void submit(question, heard)}>
              Find my rights &rarr;
            </button>
          </div>
        )}

        {error && (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        )}

        {voice.phase === "idle" && !submitting && !heard && (
          <>
            <div className={styles.or}>
              <span>or speak</span>
            </div>
            <div className={styles.voice}>
              <button type="button" className={styles.mic} aria-label="Tap to speak your question" onClick={() => void voice.start()}>
                <span aria-hidden="true">&#127908;</span>
              </button>
              <p className={styles.micLabel}>Tap to speak your question</p>
              <p className={styles.micHint}>Voice input: English. Type in English, Hindi, or Marathi.</p>
            </div>
          </>
        )}

      </div>

      {!heard && voice.phase === "idle" && !submitting && (
        <section className={styles.suggest} aria-labelledby="suggest-title">
          <h2 id="suggest-title">Or pick a question to get started</h2>
          <div className={styles.suggestGrid}>
            {SUGGESTIONS.map((item) => (
              <button key={item.category} type="button" className={styles.suggestCard} onClick={() => void submit(item.question)}>
                <span className={styles.suggestCat}>{item.category}</span>
                {item.question}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
