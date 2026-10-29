"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { NotificationPrefs, UserProfile } from "@nyay/shared";
import { Toggle } from "@/components/Toggle";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { SaveBar } from "../SaveBar";
import { useAutoSave } from "../useAutoSave";
import styles from "../settings.module.css";
import own from "./notifications.module.css";

type Kind = "legal_updates" | "sms_reminders" | "state_schemes" | "weekly_digest" | "chat_reminders";

const TYPES: Array<{ key: Kind; title: string; desc: string; channels: string[] }> = [
  {
    key: "legal_updates",
    title: "New legal updates",
    desc: "When a section is added to the corpus or a judgment changes the law in your state.",
    channels: ["Email", "Push", "In-app"],
  },
  {
    key: "sms_reminders",
    title: "Draft follow-up reminders",
    desc: "If you started a complaint draft but did not send it, a reminder after 3, 7 and 14 days.",
    channels: ["SMS", "Push"],
  },
  {
    key: "state_schemes",
    title: "State-specific scheme alerts",
    desc: "New Maharashtra government schemes that match your age and district.",
    channels: ["Email"],
  },
  {
    key: "weekly_digest",
    title: "Weekly digest",
    desc: "Every Monday at 9 AM IST, a summary of rights and judgments added to NYAY-SUTRA.",
    channels: ["Email"],
  },
  {
    key: "chat_reminders",
    title: "Chat session reminders",
    desc: "If a chat has been idle for 7 days, it is surfaced at the top of your Chats list.",
    channels: ["In-app"],
  },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

type PushState = "unsupported" | "default" | "granted" | "denied";

function browserName(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "this device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `This browser · ${browser} on ${os}`;
}

const noSubscribe = () => () => undefined;

function currentPermission(): PushState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export function NotificationSettings({ user }: { user: UserProfile }) {
  const persist = useCallback((patch: Partial<NotificationPrefs>) => api.updateNotifications(patch), []);
  const form = useAutoSave<NotificationPrefs>(user.notifications, persist);
  const v = form.value;
  const device = useSyncExternalStore(noSubscribe, () => browserName(navigator.userAgent), () => "This browser");
  const initialPush = useSyncExternalStore(noSubscribe, currentPermission, () => "default" as PushState);
  const [pushOverride, setPushOverride] = useState<PushState | null>(null);
  const push = pushOverride ?? initialPush;

  async function allowPush() {
    if (typeof Notification === "undefined") return;
    setPushOverride(await Notification.requestPermission());
  }

  const quietOn = v.quiet_hours_start !== null && v.quiet_hours_end !== null;

  return (
    <>
      <header className={styles.pageHead}>
        <div className="eyebrow-mono">Settings</div>
        <h1>Notifications</h1>
        <p>When NYAY-SUTRA tells you about new law, judgment updates, or reminders on drafts you started.</p>
      </header>

      <section className={styles.section} aria-labelledby="notif-types">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="notif-types" className={styles.sectionTitle}>
              What you get notified for
            </h2>
            <p className={styles.sectionDesc}>Each notification type can be turned off on its own.</p>
          </div>
        </div>
        {TYPES.map((t) => (
          <div key={t.key} className={styles.row}>
            <div>
              <div className={styles.rowHead}>{t.title}</div>
              <div className={styles.rowDesc}>{t.desc}</div>
              <div className={styles.chips}>
                {t.channels.map((c) => (
                  <span key={c} className={styles.chip}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <Toggle label={t.title} checked={v[t.key]} onChange={(on) => void form.commit({ [t.key]: on })} />
          </div>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="notif-channels">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="notif-channels" className={styles.sectionTitle}>
              Delivery channels
            </h2>
            <p className={styles.sectionDesc}>
              Where notifications reach you. Your choices are saved now; sending starts when the SMS and email service
              is connected.
            </p>
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.withIcon}>
            <span className={styles.iconBox} aria-hidden="true">
              @
            </span>
            <div>
              <div className={styles.rowHead}>Email</div>
              <div className={own.detail}>{user.email ?? "No email on this account"}</div>
            </div>
          </div>
          {user.email ? <span className={styles.statusOk}>Verified</span> : <span className={styles.statusMuted}>Not added</span>}
        </div>
        <div className={styles.row}>
          <div className={styles.withIcon}>
            <span className={styles.iconBox} aria-hidden="true">
              #
            </span>
            <div>
              <div className={styles.rowHead}>SMS</div>
              <div className={own.detail}>{formatPhone(user.phone)}</div>
            </div>
          </div>
          <span className={styles.statusOk}>Verified</span>
        </div>
        <div className={styles.row}>
          <div className={styles.withIcon}>
            <span className={styles.iconBox} aria-hidden="true">
              &#9872;
            </span>
            <div>
              <div className={styles.rowHead}>Push notifications</div>
              <div className={own.detail}>{device}</div>
            </div>
          </div>
          {push === "granted" && <span className={styles.statusOk}>Allowed</span>}
          {push === "denied" && <span className={styles.statusMuted}>Blocked in browser settings</span>}
          {push === "unsupported" && <span className={styles.statusMuted}>Not supported here</span>}
          {push === "default" && (
            <button type="button" className={styles.linkBtn} onClick={() => void allowPush()}>
              Allow
            </button>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="quiet">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="quiet" className={styles.sectionTitle}>
              Quiet hours
            </h2>
            <p className={styles.sectionDesc}>
              No push notifications during these hours, except reminders about legal deadlines.
            </p>
          </div>
          <Toggle
            label="Quiet hours"
            checked={quietOn}
            onChange={(on) =>
              void form.commit(
                on ? { quiet_hours_start: 22, quiet_hours_end: 7 } : { quiet_hours_start: null, quiet_hours_end: null },
              )
            }
          />
        </div>
        {quietOn ? (
          <div className={own.quiet}>
            <span className={own.quietLabel}>Pause between</span>
            <select
              className={own.timePill}
              aria-label="Quiet hours start"
              value={v.quiet_hours_start ?? 22}
              onChange={(e) => void form.commit({ quiet_hours_start: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
            <span className={own.arrow} aria-hidden="true">
              &rarr;
            </span>
            <select
              className={own.timePill}
              aria-label="Quiet hours end"
              value={v.quiet_hours_end ?? 7}
              onChange={(e) => void form.commit({ quiet_hours_end: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
            <span className={own.tz}>IST</span>
          </div>
        ) : (
          <p className={styles.rowDesc}>Quiet hours are off. Notifications can arrive at any time.</p>
        )}
      </section>

      <SaveBar state={form.state} dirty={form.dirty} onUndo={() => void form.undo()} />
    </>
  );
}
