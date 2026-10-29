"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ApiError, VerifyOtpResponse } from "@nyay/shared";
import { api, HttpError } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./signin.module.css";

type Step = "phone" | "otp";
type Mode = "signin" | "signup";

const OTP_LEN = 6;

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function formatMobile(d: string): string {
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SignInForm({ next }: { next: string | null }) {
  const [tab, setTab] = useState<"mobile" | "email">("mobile");
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("phone");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState<string[]>(Array.from({ length: OTP_LEN }, () => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cells = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step !== "otp") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);

  const phone = `+91${mobile}`;
  const secondsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const resendIn = resendAt ? Math.max(0, Math.round((resendAt - now) / 1000)) : 0;

  async function sendCode(isResend: boolean) {
    setError(null);
    setNetworkError(false);
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    try {
      const res = isResend ? await api.resendOtp(phone) : await api.requestOtp(phone);
      const t = Date.now();
      setNow(t);
      setExpiresAt(t + res.expires_in * 1000);
      setResendAt(t + res.resend_after * 1000);
      setDevCode(res.dev_code ?? null);
      setStep("otp");
      setOtp(Array.from({ length: OTP_LEN }, () => ""));
      window.setTimeout(() => cells.current[0]?.focus(), 30);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 429) setError(`Too many requests. Try again in ${err.retryAfter ?? 30} seconds.`);
        else if (err.status === 502) setNetworkError(true);
        else setError(err.message);
      } else setNetworkError(true);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setNetworkError(false);
    const code = otp.join("");
    if (code.length !== OTP_LEN) {
      setError("Enter all 6 digits of the code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code, mode }),
      });
      const body = (await res.json().catch(() => null)) as (Pick<VerifyOtpResponse, "is_new_user" | "user"> & ApiError) | null;
      if (!res.ok || !body) {
        if (res.status === 502) setNetworkError(true);
        else if (res.status === 409) setError("This number is already linked to an account. Sign in instead.");
        else if (res.status === 429) setError("Too many attempts. Wait a minute, then try again.");
        else setError(body?.detail ?? "Code does not match, try again.");
        return;
      }
      const dest = !body.user.onboarding_completed ? "/onboarding" : (next ?? "/home");
      window.location.assign(dest);
    } catch {
      setNetworkError(true);
    } finally {
      setBusy(false);
    }
  }

  function setCell(i: number, raw: string) {
    const d = digitsOnly(raw);
    if (d.length > 1) {
      const filled = d.slice(0, OTP_LEN).split("");
      const nextOtp = Array.from({ length: OTP_LEN }, (_, k) => filled[k] ?? "");
      setOtp(nextOtp);
      cells.current[Math.min(filled.length, OTP_LEN - 1)]?.focus();
      return;
    }
    const nextOtp = [...otp];
    nextOtp[i] = d;
    setOtp(nextOtp);
    if (d && i < OTP_LEN - 1) cells.current[i + 1]?.focus();
  }

  function onCellKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) cells.current[i - 1]?.focus();
    if (e.key === "Enter") void verify();
  }

  return (
    <div className={styles.formWrap}>
      <div className={styles.formTop}>
        <ThemeToggle />
      </div>
      <div className={styles.formEyebrow}>{mode === "signin" ? "Sign in to continue" : "Create your account"}</div>
      <h1 className={styles.h1}>{mode === "signin" ? "Welcome back." : "Join in 30 seconds."}</h1>
      <p className={styles.lede}>
        {mode === "signin"
          ? "Sign in to access your chat history, saved drafts, and language preferences."
          : "All you need is a mobile number. We will set up your language and location next."}
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mobile"}
          className={`${styles.tab} ${tab === "mobile" ? styles.tabActive : ""}`}
          onClick={() => setTab("mobile")}
        >
          Mobile + OTP
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "email"}
          className={`${styles.tab} ${tab === "email" ? styles.tabActive : ""}`}
          onClick={() => setTab("email")}
        >
          Email
        </button>
      </div>

      {tab === "email" ? (
        <div className={styles.emailNote} role="tabpanel">
          <strong>Email sign-in arrives in v2.</strong>
          <p>For now, sign in with your mobile number. It takes 30 seconds and needs no password.</p>
          <button type="button" className={styles.btnLink} onClick={() => setTab("mobile")}>
            Use mobile + OTP &rarr;
          </button>
        </div>
      ) : (
        <form
          role="tabpanel"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "phone") void sendCode(false);
            else void verify();
          }}
        >
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="mobile">
              Mobile number
            </label>
            <div className={styles.inputRow}>
              <span className={styles.countryCode}>+91</span>
              <input
                id="mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={formatMobile(mobile)}
                onChange={(e) => {
                  setMobile(digitsOnly(e.target.value).slice(0, 10));
                  if (step === "otp") setStep("phone");
                }}
                aria-describedby="mobile-help"
              />
            </div>
            <p id="mobile-help" className={styles.inputHelp}>
              We will send a 6-digit code. Standard SMS rates apply.
            </p>
          </div>

          {step === "otp" && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="otp-0">
                Enter the 6-digit code
              </label>
              <div className={styles.otpGrid}>
                {otp.map((v, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    ref={(el) => {
                      cells.current[i] = el;
                    }}
                    className={styles.otpCell}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={i === 0 ? OTP_LEN : 1}
                    value={v}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => setCell(i, e.target.value)}
                    onKeyDown={(e) => onCellKey(i, e)}
                  />
                ))}
              </div>
              <div className={styles.resend}>
                <span>{secondsLeft > 0 ? `Code expires in ${mmss(secondsLeft)}` : "Code expired. Request a new one."}</span>
                <button
                  type="button"
                  className={styles.btnLink}
                  disabled={resendIn > 0 || busy}
                  onClick={() => void sendCode(true)}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
              {devCode && (
                <p className={styles.devCode} role="status">
                  Dev mode: SMS is not configured on this API, so the code is shown here: <b>{devCode}</b>
                </p>
              )}
            </div>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {networkError && (
            <div className={styles.error} role="alert">
              Could not reach NYAY-SUTRA. Check your connection.{" "}
              <button type="submit" className={styles.btnLink}>
                Retry
              </button>
            </div>
          )}

          <button type="submit" className={`btn-primary ${styles.submit}`} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {step === "phone" ? "Send code \u2192" : mode === "signin" ? "Verify and sign in \u2192" : "Verify and create account \u2192"}
          </button>
        </form>
      )}

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <p className={styles.switchMode}>
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button type="button" className={styles.btnLink} onClick={() => setMode("signup")}>
              Create one in 30 seconds &rarr;
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" className={styles.btnLink} onClick={() => setMode("signin")}>
              Sign in instead &rarr;
            </button>
          </>
        )}
      </p>

      <p className={styles.legal}>
        By signing in you agree to our <Link href="/about#terms">Terms</Link> and{" "}
        <Link href="/about#privacy">Privacy Policy</Link>.
        <br />
        Not legal advice. For complex matters, consult a practicing advocate.
      </p>
    </div>
  );
}
