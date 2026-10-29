"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Gender, Language, ProfileUpdate, UserProfile } from "@nyay/shared";
import { api, HttpError } from "@/lib/api";
import { LANGUAGE_LABEL } from "@/lib/format";
import { ONBOARDING_SKIP_COOKIE } from "@/lib/session";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DistrictField, GenderPills, LanguageCards, StateSelect } from "@/components/ProfileFields";
import styles from "./onboarding.module.css";

interface Errors {
  name?: string;
  age?: string;
  form?: string;
}

export function OnboardingForm({ user }: { user: UserProfile }) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [age, setAge] = useState(user.age ? String(user.age) : "");
  const [gender, setGender] = useState<Gender>(user.gender ?? "undisclosed");
  const [state, setState] = useState(user.state || "Maharashtra");
  const [district, setDistrict] = useState(user.district ?? "");
  const [area, setArea] = useState(user.area ?? "");
  const [language, setLanguage] = useState<Language>(user.preferred_language);
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState<"create" | "defaults" | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  function skip() {
    document.cookie = `${ONBOARDING_SKIP_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }

  async function save(patch: ProfileUpdate, which: "create" | "defaults") {
    setBusy(which);
    setErrors({});
    try {
      await api.updateMe({ ...patch, onboarding_completed: true });
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setErrors({ form: err instanceof HttpError ? err.message : "Could not save. Check your connection and try again." });
      setBusy(null);
    }
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const trimmed = name.trim();
    if (trimmed.length < 2) next.name = "Tell us what to call you.";
    const ageNum = Number(age);
    if (!age || !Number.isInteger(ageNum)) next.age = "Enter your age in years.";
    else if (ageNum < 13) next.age = "You must be at least 13.";
    else if (ageNum > 120) next.age = "Enter an age between 13 and 120.";
    if (next.name || next.age) {
      setErrors(next);
      document.getElementById(next.name ? "name" : "age")?.focus();
      return;
    }
    void save(
      {
        name: trimmed,
        age: ageNum,
        gender,
        state,
        district: district.trim() || null,
        area: area.trim() || null,
        preferred_language: language,
        preferred_voice_language: language,
      },
      "create",
    );
  }

  function onDefaults() {
    void save(
      {
        name: "Friend",
        age: 25,
        gender: "undisclosed",
        state: "Maharashtra",
        preferred_language: "english",
        preferred_voice_language: "english",
      },
      "defaults",
    );
  }

  return (
    <>
      <header className={styles.stepperBar}>
        <div className={styles.stepperInner}>
          <span className="brand">
            <BrandLogo />
          </span>
          <div className={styles.progress} aria-label="Progress">
            <span>Step 1 of 1</span>
            <span className={styles.dots} aria-hidden="true">
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
            <span>Almost there</span>
          </div>
          <div className={styles.topRight}>
            <ThemeToggle />
            <Link href="/home" className={styles.skip} onClick={skip}>
              Skip for now &rarr;
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>
        <form className={styles.container} onSubmit={onCreate} noValidate>
          <div className={styles.pageHead}>
            <div className="eyebrow-mono">Set up your account</div>
            <h1>
              Tell us a bit about <em>yourself</em>.
            </h1>
            <p>We use this to personalise answers. Your data stays on your account, never sold, never shared.</p>
          </div>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.num}>1</span>
              <h2 className={styles.sectionTitle}>About you</h2>
              <span className={styles.sectionSub}>Required</span>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="name">
                  Your name
                </label>
                <input
                  id="name"
                  className="input"
                  type="text"
                  maxLength={120}
                  autoComplete="given-name"
                  placeholder="First name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-err" : undefined}
                />
                {errors.name && (
                  <span id="name-err" className="field-error">
                    {errors.name}
                  </span>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="age">
                  Age
                </label>
                <input
                  id="age"
                  className="input"
                  type="number"
                  min={13}
                  max={120}
                  inputMode="numeric"
                  placeholder="Years"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  aria-invalid={Boolean(errors.age)}
                  aria-describedby="age-hint"
                />
                {errors.age ? (
                  <span id="age-hint" className="field-error">
                    {errors.age}
                  </span>
                ) : (
                  <span id="age-hint" className="field-hint">
                    Used to tailor answers (under-18 mode, senior mode).
                  </span>
                )}
              </div>
              <div className={`${styles.field} ${styles.full}`}>
                <span className={styles.label}>
                  Gender <span className={styles.optional}>(optional)</span>
                </span>
                <GenderPills value={gender} onChange={setGender} />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.num}>2</span>
              <h2 className={styles.sectionTitle}>Where are you from?</h2>
              <span className={styles.sectionSub}>State-specific laws</span>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="state">
                  State
                </label>
                <StateSelect
                  id="state"
                  value={state}
                  onChange={(v) => {
                    setState(v);
                    setDistrict("");
                  }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="district">
                  District
                </label>
                <DistrictField id="district" state={state} value={district} onChange={setDistrict} />
              </div>
              <div className={`${styles.field} ${styles.full}`}>
                <label className={styles.label} htmlFor="area">
                  Area / locality <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id="area"
                  className="input"
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Andheri West, Koregaon Park"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.infoBanner}>
              <span aria-hidden="true">&#8982;</span>
              <span>
                <strong>Maharashtra-focused.</strong> Most statutes are central, but state-specific acts (like the
                Maharashtra Rent Control Act, 1999) load for Maharashtra. Other states get the central acts.
              </span>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.num}>3</span>
              <h2 className={styles.sectionTitle}>Choose your preferred language</h2>
              <span className={styles.sectionSub}>4 options</span>
            </div>
            <LanguageCards value={language} onChange={setLanguage} />
            <p className={styles.langNote} role="status">
              Answers will be in <strong>{LANGUAGE_LABEL[language]}</strong>. The app menus stay in English in this
              version. You can switch any time from <strong>Settings &rarr; Language</strong>.
            </p>
          </section>

          <div className={styles.consent}>
            <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <label htmlFor="consent">
              I agree that NYAY-SUTRA may store my profile and chat history to provide personalised answers. NYAY-SUTRA
              is <strong>not</strong> a substitute for a licensed advocate. For court proceedings, always consult one.{" "}
              <Link href="/about#privacy">Privacy policy</Link>.
            </label>
          </div>

          {errors.form && (
            <p className="field-error" role="alert">
              {errors.form}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={`btn-ghost ${styles.ghost}`} onClick={onDefaults} disabled={busy !== null}>
              {busy === "defaults" && <span className="spinner" aria-hidden="true" />}
              Use defaults
            </button>
            <button type="submit" className={`btn-primary ${styles.primary}`} disabled={!consent || busy !== null}>
              {busy === "create" && <span className="spinner" aria-hidden="true" />}
              Create account &rarr;
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
