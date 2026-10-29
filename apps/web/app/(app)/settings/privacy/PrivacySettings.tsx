"use client";

import { useCallback } from "react";
import type { PrivacyPrefs, UserProfile } from "@nyay/shared";
import { Toggle } from "@/components/Toggle";
import { api } from "@/lib/api";
import { SaveBar } from "../SaveBar";
import { useAutoSave } from "../useAutoSave";
import styles from "../settings.module.css";
import own from "./privacy.module.css";

/** Slider stops. 0 means chats are never deleted automatically. */
const STOPS = [7, 30, 90, 180, 365, 0] as const;
const STOP_LABEL = ["7 days", "30", "90", "180", "365", "Never"];

function stopIndex(days: number): number {
  const exact = STOPS.indexOf(days as (typeof STOPS)[number]);
  if (exact >= 0) return exact;
  let best = 0;
  STOPS.forEach((s, i) => {
    if (s && Math.abs(s - days) < Math.abs((STOPS[best] ?? 0) - days)) best = i;
  });
  return best;
}

const PERMISSIONS: Array<{ what: string; who: string; why: string; allowed: string; yes: boolean }> = [
  { what: "Your question (text)", who: "Groq · Llama 3.3 70B", why: "To write the answer", allowed: "Required", yes: true },
  {
    what: "Your question (text)",
    who: "Google · Gemini 2.0 Flash",
    why: "Fallback when Groq is busy",
    allowed: "Automatic",
    yes: true,
  },
  {
    what: "Voice recording",
    who: "Bhashini · MeitY",
    why: "Speech to text in Marathi and Hindi",
    allowed: "When you record",
    yes: true,
  },
  {
    what: "Voice recording",
    who: "Hugging Face · Whisper (open model)",
    why: "Speech to text in English",
    allowed: "When you record",
    yes: true,
  },
  { what: "Profile and chat history", who: "Supabase · Mumbai region", why: "Stores your account", allowed: "Always", yes: true },
  {
    what: "Questions you flag as wrong",
    who: "NYAY-SUTRA maintainers",
    why: "Find law missing from the corpus",
    allowed: "If you opt in",
    yes: true,
  },
  { what: "Voice recording", who: "NYAY-SUTRA team", why: "Not applicable", allowed: "Never", yes: false },
  { what: "Profile and chats", who: "Advertisers", why: "Not applicable", allowed: "Never", yes: false },
  { what: "Profile and chats", who: "Law firms or agencies", why: "Not applicable", allowed: "Never", yes: false },
];

export function PrivacySettings({ user }: { user: UserProfile }) {
  const persist = useCallback((patch: Partial<PrivacyPrefs>) => api.updatePrivacy(patch), []);
  const form = useAutoSave<PrivacyPrefs>(user.privacy, persist);
  const v = form.value;
  const index = stopIndex(v.retention_days);
  const days = STOPS[index] ?? 90;
  const retentionText = !v.save_chat_history ? "7 days" : days === 0 ? "Never" : `${days} days`;

  return (
    <>
      <header className={styles.pageHead}>
        <div className="eyebrow-mono">Settings</div>
        <h1>Privacy</h1>
        <p>What NYAY-SUTRA remembers, who it shares with, and how long things are kept.</p>
      </header>

      <div className={styles.darkHero}>
        <div className={styles.heroIcon} aria-hidden="true">
          &#9826;
        </div>
        <div>
          <h2>Your data is never sold.</h2>
          <p>
            AI providers receive the text of your question, never your name or phone number. Your account is stored
            in Supabase&apos;s Mumbai region. Voice is transcribed by Bhashini (MeitY, Government of India), with an
            open Whisper model as the English fallback, and the audio is deleted straight after. We never share your
            data with law firms and never use it for advertising.
          </p>
        </div>
      </div>

      <section className={styles.section} aria-labelledby="anon">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="anon" className={styles.sectionTitle}>
              Anonymity and profile
            </h2>
            <p className={styles.sectionDesc}>Control what NYAY-SUTRA attaches to you.</p>
          </div>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Keep my name off drafts</div>
            <div className={styles.rowDesc}>
              Downloaded drafts leave your name and mobile number blank for you to fill in by hand. Your name is never
              sent to AI providers either way.
            </div>
          </div>
          <Toggle
            label="Keep my name off drafts"
            checked={v.anonymous_by_default}
            onChange={(anonymous_by_default) => void form.commit({ anonymous_by_default })}
          />
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Save chat history</div>
            <div className={styles.rowDesc}>
              Off means chats are deleted 7 days after their last message. On means they follow the auto-delete
              setting below.
            </div>
          </div>
          <Toggle
            label="Save chat history"
            checked={v.save_chat_history}
            onChange={(save_chat_history) => void form.commit({ save_chat_history })}
          />
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Use profile for personalisation</div>
            <div className={styles.rowDesc}>
              New chats use your age and locality to pick age-specific provisions. Turn off for general answers. Your
              state is always used, because it decides which state Acts apply.
            </div>
          </div>
          <Toggle
            label="Use profile for personalisation"
            checked={v.use_profile_personalisation}
            onChange={(use_profile_personalisation) => void form.commit({ use_profile_personalisation })}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="retention">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="retention" className={styles.sectionTitle}>
              Retention
            </h2>
            <p className={styles.sectionDesc}>How long your data is kept.</p>
          </div>
        </div>
        <div className={own.retention}>
          <div className={own.retentionLabel}>
            <label htmlFor="retention-slider">Auto-delete chats after</label>
            <span className={own.retentionValue} aria-live="polite">
              {retentionText}
            </span>
          </div>
          <input
            id="retention-slider"
            type="range"
            className={own.slider}
            min={0}
            max={STOPS.length - 1}
            step={1}
            value={index}
            disabled={!v.save_chat_history}
            aria-valuetext={retentionText}
            onChange={(e) => form.commitLater({ retention_days: STOPS[Number(e.target.value)] ?? 90 })}
          />
          <div className={own.sliderLabels} aria-hidden="true">
            {STOP_LABEL.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          {!v.save_chat_history && (
            <p className={own.retentionHint}>Chat history is off, so chats are deleted after 7 days.</p>
          )}
        </div>
        <div className={styles.row} style={{ paddingTop: 16 }}>
          <div>
            <div className={styles.rowHead}>Voice recordings</div>
            <div className={styles.rowDesc}>
              Audio is sent for transcription and deleted as soon as the text comes back. It is never stored or used
              for training.
            </div>
          </div>
          <span className={styles.statusOk}>Always deleted</span>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Help improve answers</div>
            <div className={styles.rowDesc}>
              When you flag an answer as wrong, keep the question with the report so missing law can be added. Never
              includes your name, phone or profile.
            </div>
          </div>
          <Toggle
            label="Help improve answers"
            checked={v.help_improve}
            onChange={(help_improve) => void form.commit({ help_improve })}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="who">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="who" className={styles.sectionTitle}>
              Who can see your data
            </h2>
            <p className={styles.sectionDesc}>Where your information goes, and who can look at it.</p>
          </div>
        </div>
        <div className={own.tableWrap}>
          <table className={own.table}>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Who</th>
                <th scope="col">Why</th>
                <th scope="col" className={own.right}>
                  Allowed
                </th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={`${p.what}-${p.who}`}>
                  <td>{p.what}</td>
                  <td>{p.who}</td>
                  <td className={p.yes ? "" : own.muted}>{p.why}</td>
                  <td className={`${own.right} ${p.yes ? own.yes : own.no}`}>{p.allowed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SaveBar state={form.state} dirty={form.dirty} onUndo={() => void form.undo()} />
    </>
  );
}
