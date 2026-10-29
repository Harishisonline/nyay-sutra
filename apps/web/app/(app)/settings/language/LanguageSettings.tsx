"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language, UserProfile } from "@nyay/shared";
import { LanguageCards } from "@/components/ProfileFields";
import { Toggle } from "@/components/Toggle";
import { api, voicePreviewUrl } from "@/lib/api";
import { LANGUAGE_LABEL } from "@/lib/format";
import { SaveBar } from "../SaveBar";
import { useAutoSave } from "../useAutoSave";
import styles from "../settings.module.css";
import own from "./language.module.css";

type LanguageForm = {
  preferred_language: Language;
  preferred_voice_language: Language;
  voice_playback: boolean;
};

const PREVIEW_TEXT: Record<Language, string> = {
  english: "Your landlord cannot cut your water supply without just cause.",
  hinglish: "Aapka landlord bina wajah paani ki supply nahi kaat sakta.",
  marathi: "तुमचे घरमालक योग्य कारणाशिवाय पाणीपुरवठा बंद करू शकत नाहीत.",
  hindi: "आपका मकान मालिक बिना उचित कारण पानी की आपूर्ति नहीं काट सकता।",
};

const LOCALE: Record<Language, string> = { english: "en-IN", hinglish: "hi-IN", marathi: "mr-IN", hindi: "hi-IN" };

type Preview = { kind: "idle" } | { kind: "loading" } | { kind: "playing"; seconds: number } | { kind: "error"; message: string };

export function LanguageSettings({ user }: { user: UserProfile }) {
  const persist = useCallback((patch: Partial<LanguageForm>) => api.updateMe(patch), []);
  const form = useAutoSave<LanguageForm>(
    {
      preferred_language: user.preferred_language,
      preferred_voice_language: user.preferred_voice_language,
      voice_playback: user.voice_playback,
    },
    persist,
  );
  const v = form.value;
  const [follows, setFollows] = useState(user.preferred_voice_language === user.preferred_language);
  const [preview, setPreview] = useState<Preview>({ kind: "idle" });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceLang = follows ? v.preferred_language : v.preferred_voice_language;

  useEffect(() => () => audioRef.current?.pause(), []);

  function chooseLanguage(lang: Language) {
    void form.commit(follows ? { preferred_language: lang, preferred_voice_language: lang } : { preferred_language: lang });
  }

  function toggleFollows(next: boolean) {
    setFollows(next);
    if (next) void form.commit({ preferred_voice_language: v.preferred_language });
  }

  async function playPreview() {
    if (preview.kind === "playing" || preview.kind === "loading") {
      audioRef.current?.pause();
      setPreview({ kind: "idle" });
      return;
    }
    setPreview({ kind: "loading" });
    try {
      const res = await fetch(voicePreviewUrl(voiceLang));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(
          res.status === 503
            ? "Voice is not switched on for this server yet. Answers still show as text."
            : (body?.detail ?? `Preview failed (${res.status}).`),
        );
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPreview({ kind: "idle" });
      };
      audio.onloadedmetadata = () => setPreview({ kind: "playing", seconds: audio.duration });
      await audio.play();
      setPreview((p) => (p.kind === "loading" ? { kind: "playing", seconds: audio.duration || 0 } : p));
    } catch (err) {
      setPreview({ kind: "error", message: err instanceof Error ? err.message : "Preview failed." });
    }
  }

  const playing = preview.kind === "playing" || preview.kind === "loading";
  const seconds = preview.kind === "playing" && Number.isFinite(preview.seconds) ? Math.round(preview.seconds) : null;

  return (
    <>
      <header className={styles.pageHead}>
        <div className="eyebrow-mono">Settings</div>
        <h1>Language</h1>
        <p>The language NYAY-SUTRA answers in, speaks in, and writes your drafts in.</p>
      </header>

      <section className={styles.section} aria-labelledby="pref-lang">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="pref-lang" className={styles.sectionTitle}>
              Preferred language
            </h2>
            <p className={styles.sectionDesc}>Answers, drafts and voice switch to this language for new chats.</p>
          </div>
        </div>
        <LanguageCards value={v.preferred_language} onChange={chooseLanguage} />
        <div className={styles.note}>
          <span aria-hidden="true">&#8997;</span>
          <span>
            Answers are written in <strong>{LANGUAGE_LABEL[v.preferred_language]}</strong>. Menus and buttons stay in
            English. Each past chat keeps the language it was asked in.
          </span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="voice-out">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="voice-out" className={styles.sectionTitle}>
              Voice output
            </h2>
            <p className={styles.sectionDesc}>Hear answers read aloud in your language.</p>
          </div>
        </div>

        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Enable voice playback</div>
            <div className={styles.rowDesc}>Each answer gets a Listen button. Turn off to read silently.</div>
          </div>
          <Toggle
            label="Enable voice playback"
            checked={v.voice_playback}
            onChange={(voice_playback) => void form.commit({ voice_playback })}
          />
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Voice language follows answer language</div>
            <div className={styles.rowDesc}>
              If the answer is in Marathi, the voice reads Marathi. Turn off to always use one voice language.
            </div>
            {!follows && (
              <label className={own.voiceSelect}>
                <span className="sr-only">Voice language</span>
                <select
                  className="select"
                  value={v.preferred_voice_language}
                  onChange={(e) => void form.commit({ preferred_voice_language: e.target.value as Language })}
                >
                  {(Object.keys(LANGUAGE_LABEL) as Language[]).map((l) => (
                    <option key={l} value={l}>
                      Always read in {LANGUAGE_LABEL[l]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Toggle label="Voice language follows answer language" checked={follows} onChange={toggleFollows} />
        </div>

        <div className={own.preview}>
          <button
            type="button"
            className={own.playBtn}
            aria-label={playing ? "Stop voice preview" : "Play voice preview"}
            onClick={() => void playPreview()}
          >
            {preview.kind === "loading" ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{playing ? "\u25A0" : "\u25B6"}</span>
            )}
          </button>
          <div className={own.previewBody}>
            <div className={own.previewLabel}>Voice preview · {LANGUAGE_LABEL[voiceLang]}</div>
            <div className={own.previewText}>&ldquo;{PREVIEW_TEXT[voiceLang]}&rdquo;</div>
            {preview.kind === "error" && (
              <div className={own.previewError} role="alert">
                {preview.message}
              </div>
            )}
          </div>
          <div className={own.previewMeta}>
            {seconds !== null ? `0:${String(seconds).padStart(2, "0")} · ` : ""}
            {LOCALE[voiceLang]}
          </div>
        </div>
      </section>

      <SaveBar
        state={form.state}
        dirty={form.dirty}
        onUndo={() => {
          setFollows(user.preferred_voice_language === user.preferred_language);
          void form.undo();
        }}
      />
    </>
  );
}
