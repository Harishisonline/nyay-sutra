"use client";

import Link from "next/link";
import { useState } from "react";
import type { SessionInfo, StorageUsage, UserProfile } from "@nyay/shared";
import { EXPORT_URL, HttpError, api, signOut } from "@/lib/api";
import { formatDateTime, formatLongDate, formatPhone, plural } from "@/lib/format";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import styles from "../settings.module.css";

function deviceIcon(device: string): string {
  if (/iPhone|Android/.test(device)) return "\u25A2";
  if (/Windows/.test(device)) return "\u25A3";
  return "\u2318";
}

export function AccountSettings({
  user,
  sessions: initialSessions,
  storage,
}: {
  user: UserProfile;
  sessions: SessionInfo[];
  storage: StorageUsage;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const others = sessions.filter((s) => !s.current);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const revoke = (id: string) =>
    run(id, async () => {
      await api.revokeSession(id);
      setSessions((list) => list.filter((s) => s.id !== id));
    });

  const revokeOthers = () =>
    run("others", async () => {
      await api.revokeOtherSessions();
      setSessions((list) => list.filter((s) => s.current));
    });

  const signOutHere = () =>
    run("signout", async () => {
      await signOut();
      window.location.assign(new URL("/signin", window.location.origin).href);
    });

  return (
    <>
      <header className={styles.pageHead}>
        <div className="eyebrow-mono">Settings</div>
        <h1>Account</h1>
        <p>How you sign in, which devices are signed in, and what your account stores.</p>
      </header>

      {error && (
        <p className={styles.fieldError} role="alert" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      <section className={styles.section} aria-labelledby="ident">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="ident" className={styles.sectionTitle}>
              Identification
            </h2>
            <p className={styles.sectionDesc}>You sign in with a one-time code sent to your mobile number.</p>
          </div>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Mobile number</div>
          <div className={styles.kvValue}>{formatPhone(user.phone)}</div>
          <span className={styles.statusOk}>Verified</span>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Email</div>
          <div className={styles.kvValue}>
            {user.email ?? "Not added"}
            {!user.email && <small>Not needed. Your mobile number is your sign-in.</small>}
          </div>
          {user.email ? <span className={styles.statusOk}>Verified</span> : <span className={styles.statusMuted}>Optional</span>}
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Aadhaar</div>
          <div className={styles.kvValue}>
            {user.aadhaar_last4 ? `Linked · XXXX-XXXX-${user.aadhaar_last4}` : "Not linked"}
            <small>NYAY-SUTRA never asks for or stores your full Aadhaar number.</small>
          </div>
          <span className={styles.statusMuted}>{user.aadhaar_last4 ? "Last 4 only" : "Not required"}</span>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Password</div>
          <div className={styles.kvValue}>
            No password
            <small>Each sign-in uses a fresh 6-digit code, so there is nothing to leak or reset.</small>
          </div>
          <span className={styles.statusOk}>OTP only</span>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Account created</div>
          <div className={styles.kvValue}>{formatLongDate(user.created_at)}</div>
          <span />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sessions">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="sessions" className={styles.sectionTitle}>
              Active sessions
            </h2>
            <p className={styles.sectionDesc}>Where you are signed in right now.</p>
          </div>
          {others.length > 0 && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => void revokeOthers()}
              disabled={busy === "others"}
            >
              Sign out of all others
            </button>
          )}
        </div>
        {sessions.map((s) => (
          <div key={s.id} className={styles.row}>
            <div className={styles.withIcon}>
              <span className={styles.iconBox} aria-hidden="true">
                {deviceIcon(s.device)}
              </span>
              <div>
                <div className={styles.rowHead}>{s.device}</div>
                <div className={styles.rowDesc}>
                  Signed in {formatDateTime(s.created_at)} IST · last active {formatDateTime(s.last_seen_at)} IST
                </div>
              </div>
            </div>
            {s.current ? (
              <span className={styles.badge}>This device</span>
            ) : (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => void revoke(s.id)}
                disabled={busy === s.id}
              >
                Sign out
              </button>
            )}
          </div>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="storage">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="storage" className={styles.sectionTitle}>
              Storage used
            </h2>
            <p className={styles.sectionDesc}>What your account keeps.</p>
          </div>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Chats</div>
          <div className={styles.kvValue}>
            {plural(storage.chats, "conversation")} · {plural(storage.messages, "message")}
          </div>
          <Link href="/chats" className={styles.linkBtn}>
            Manage
          </Link>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Drafts</div>
          <div className={styles.kvValue}>{plural(storage.drafts, "draft")} saved</div>
          <Link href="/drafts" className={styles.linkBtn}>
            Manage
          </Link>
        </div>
        <div className={styles.kvRow}>
          <div className={styles.kvLabel}>Voice recordings</div>
          <div className={styles.kvValue}>Deleted after transcription</div>
          <span className={styles.statusOk}>None stored</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="export">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="export" className={styles.sectionTitle}>
              Export your data
            </h2>
            <p className={styles.sectionDesc}>Download everything in one portable JSON file.</p>
          </div>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Download a full export</div>
            <div className={styles.rowDesc}>
              Profile, settings, every chat with its citations, and every draft. Downloads straight away.
            </div>
          </div>
          <a href={EXPORT_URL} download="nyay-sutra-export.json" className="btn-primary">
            Download JSON
          </a>
        </div>
      </section>

      <section className={styles.danger} aria-labelledby="danger">
        <h2 id="danger" className={styles.dangerTitle}>
          Danger zone
        </h2>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Sign out of this device</div>
            <div className={styles.rowDesc}>You will need a new code from your mobile the next time you sign in.</div>
          </div>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={() => void signOutHere()}
            disabled={busy === "signout"}
          >
            Sign out
          </button>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Delete account</div>
            <div className={styles.rowDesc}>
              All chats, drafts and profile data are removed. This cannot be undone.
            </div>
          </div>
          <button type="button" className={styles.btnDanger} onClick={() => setDeleting(true)}>
            Delete account
          </button>
        </div>
      </section>

      {deleting && <DeleteAccountDialog phone={user.phone} onClose={() => setDeleting(false)} />}
    </>
  );
}
