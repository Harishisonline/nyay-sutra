"use client";

import type { Gender, Language } from "@nyay/shared";
import { STATES, districtsFor } from "@/lib/geo";
import { LANGUAGE_NATIVE } from "@/lib/format";
import styles from "./ProfileFields.module.css";

export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "undisclosed", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

export function GenderPills({ value, onChange }: { value: Gender | null; onChange: (g: Gender) => void }) {
  return (
    <div className={styles.pillRow} role="radiogroup" aria-label="Gender">
      {GENDER_OPTIONS.map((g) => {
        const active = (value ?? "undisclosed") === g.value;
        return (
          <button
            key={g.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.pill} ${active ? styles.pillActive : ""}`}
            onClick={() => onChange(g.value)}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

export function StateSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} className={`select ${styles.select}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {STATES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function DistrictField({
  id,
  state,
  value,
  onChange,
  onBlur,
}: {
  id: string;
  state: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  const options = districtsFor(state);
  if (!options) {
    return (
      <input
        id={id}
        className="input"
        type="text"
        maxLength={60}
        placeholder="Your district"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    );
  }
  return (
    <select id={id} className={`select ${styles.select}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a district</option>
      {options.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

export const LANGUAGE_CARDS: Array<{ value: Language; code: string; sample: string }> = [
  { value: "english", code: "EN", sample: "\u201CCan my landlord cut water supply?\u201D" },
  { value: "hinglish", code: "HI + EN", sample: "\u201CKya landlord paani ki supply cut kar sakta hai?\u201D" },
  { value: "marathi", code: "Marathi", sample: "\u201Cमाझे मालक पाणी बंद करू शकतात का?\u201D" },
  { value: "hindi", code: "Hindi", sample: "\u201Cक्या मकान मालिक पानी काट सकता है?\u201D" },
];

export function LanguageCards({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  return (
    <div className={styles.langGrid} role="radiogroup" aria-label="Preferred language">
      {LANGUAGE_CARDS.map((l) => {
        const active = value === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.langCard} ${active ? styles.langActive : ""}`}
            onClick={() => onChange(l.value)}
          >
            <div className={styles.langHead}>
              <span className={styles.langName}>{LANGUAGE_NATIVE[l.value]}</span>
              <span className={styles.radio} aria-hidden="true" />
            </div>
            <div className={styles.langCode}>{l.code}</div>
            <div className={styles.langSample}>{l.sample}</div>
          </button>
        );
      })}
    </div>
  );
}
