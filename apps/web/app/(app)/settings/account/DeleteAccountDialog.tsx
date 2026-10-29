"use client";

import { useEffect, useRef, useState } from "react";
import { HttpError, api, signOut } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import styles from "../settings.module.css";

type Step = { kind: "confirm" } | { kind: "code"; devCode?: string };

/** Deleting an account needs a fresh code from the user's phone, not just a live session. */
export function DeleteAccountDialog({ phone, onClose }: { phone: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "confirm" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (step.kind === "code") codeRef.current?.focus();
  }, [step.kind]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const sent = await api.requestDeleteCode();
      setStep({ kind: "code", devCode: sent.dev_code });
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(code);
      await signOut();
      window.location.assign(new URL("/", window.location.origin).href);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not delete the account. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-title">Delete your account?</h2>
        {step.kind === "confirm" ? (
          <>
            <p>
              Every chat, draft and profile detail will be removed and you will be signed out everywhere. To confirm,
              we will send a code to {formatPhone(phone)}.
            </p>
            {error && (
              <p className={styles.fieldError} role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                Keep my account
              </button>
              <button type="button" className="btn-danger" onClick={() => void sendCode()} disabled={busy}>
                {busy ? "Sending\u2026" : "Send code"}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void confirmDelete(e)} noValidate>
            <p>Enter the 6-digit code sent to {formatPhone(phone)}.</p>
            {step.devCode && (
              <p className="field-hint">
                Development mode: your code is <strong className="mono">{step.devCode}</strong>
              </p>
            )}
            <label htmlFor="delete-code" className="sr-only">
              6-digit code
            </label>
            <input
              id="delete-code"
              ref={codeRef}
              className="input mono"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              aria-invalid={Boolean(error)}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && (
              <p className={styles.fieldError} role="alert" style={{ marginTop: 8 }}>
                {error}
              </p>
            )}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-danger" disabled={busy}>
                {busy ? "Deleting\u2026" : "Delete permanently"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
