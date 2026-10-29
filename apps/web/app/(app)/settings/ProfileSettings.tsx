"use client";

import { useCallback, useState } from "react";
import type { Gender, UserProfile } from "@nyay/shared";
import { DistrictField, GenderPills, StateSelect } from "@/components/ProfileFields";
import { api } from "@/lib/api";
import { districtsFor } from "@/lib/geo";
import { SaveBar } from "./SaveBar";
import { useAutoSave } from "./useAutoSave";
import styles from "./settings.module.css";

type ProfileForm = {
  name: string;
  age: string;
  gender: Gender | null;
  state: string;
  district: string;
  area: string;
};

type Errors = Partial<Record<"name" | "age", string>>;

function toPatch(patch: Partial<ProfileForm>) {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name.trim();
  if (patch.age !== undefined) out.age = patch.age ? Number(patch.age) : null;
  if (patch.gender !== undefined) out.gender = patch.gender;
  if (patch.state !== undefined) out.state = patch.state;
  if (patch.district !== undefined) out.district = patch.district.trim() || null;
  if (patch.area !== undefined) out.area = patch.area.trim() || null;
  return out;
}

export function ProfileSettings({ user }: { user: UserProfile }) {
  const persist = useCallback((patch: Partial<ProfileForm>) => api.updateMe(toPatch(patch)), []);
  const form = useAutoSave<ProfileForm>(
    {
      name: user.name ?? "",
      age: user.age ? String(user.age) : "",
      gender: user.gender,
      state: user.state,
      district: user.district ?? "",
      area: user.area ?? "",
    },
    persist,
  );
  const [errors, setErrors] = useState<Errors>({});
  const v = form.value;

  function saveName() {
    const name = v.name.trim();
    if (name.length < 2) {
      setErrors((e) => ({ ...e, name: "Enter at least 2 characters." }));
      return;
    }
    setErrors((e) => ({ ...e, name: undefined }));
    void form.commit({ name });
  }

  function saveAge() {
    const age = Number(v.age);
    if (!v.age || !Number.isInteger(age) || age < 13 || age > 120) {
      setErrors((e) => ({ ...e, age: "Enter your age in years, between 13 and 120." }));
      return;
    }
    setErrors((e) => ({ ...e, age: undefined }));
    void form.commit({ age: String(age) });
  }

  return (
    <>
      <header className={styles.pageHead}>
        <div className="eyebrow-mono">Settings</div>
        <h1>Profile</h1>
        <p>Personal details that NYAY-SUTRA uses to personalise answers.</p>
      </header>

      <section className={styles.section} aria-labelledby="about-you">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="about-you" className={styles.sectionTitle}>
              About you
            </h2>
            <p className={styles.sectionDesc}>Used to pick the right state Acts and age-specific provisions.</p>
          </div>
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className="input"
              type="text"
              maxLength={120}
              autoComplete="name"
              value={v.name}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
              onChange={(e) => form.set({ name: e.target.value })}
              onBlur={saveName}
            />
            {errors.name && (
              <span id="name-error" className={styles.fieldError}>
                {errors.name}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="age">
              Age
            </label>
            <input
              id="age"
              className="input"
              type="number"
              inputMode="numeric"
              min={13}
              max={120}
              value={v.age}
              aria-invalid={Boolean(errors.age)}
              aria-describedby={errors.age ? "age-error" : undefined}
              onChange={(e) => form.set({ age: e.target.value })}
              onBlur={saveAge}
            />
            {errors.age && (
              <span id="age-error" className={styles.fieldError}>
                {errors.age}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="state">
              State
            </label>
            <StateSelect
              id="state"
              value={v.state}
              onChange={(state) => {
                const keep = districtsFor(state)?.includes(v.district) ?? !districtsFor(v.state);
                void form.commit(keep ? { state } : { state, district: "" });
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="district">
              District
            </label>
            <DistrictField
              id="district"
              state={v.state}
              value={v.district}
              onChange={(district) => {
                if (districtsFor(v.state)) void form.commit({ district });
                else form.set({ district });
              }}
              onBlur={() => void form.commit({ district: v.district.trim() })}
            />
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <label className={styles.fieldLabel} htmlFor="area">
              Area / locality <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="area"
              className="input"
              type="text"
              maxLength={120}
              placeholder="For example: Kothrud"
              value={v.area}
              onChange={(e) => form.set({ area: e.target.value })}
              onBlur={() => void form.commit({ area: v.area.trim() })}
            />
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <span className={styles.fieldLabel} id="gender-label">
              Gender <span className={styles.optional}>(optional)</span>
            </span>
            <GenderPills value={v.gender} onChange={(gender) => void form.commit({ gender })} />
          </div>
        </div>

        <div className={styles.banner}>
          <strong>Age-aware answers.</strong> Your age and place are copied into each new chat when you start it. If
          you are under 18, answers lead with child-specific provisions such as the Right of Children to Free and
          Compulsory Education Act, 2009. Changes here apply to new chats only; existing chats keep the details they
          were started with.
        </div>
      </section>

      <SaveBar state={form.state} dirty={form.dirty} onUndo={() => void form.undo()} />
    </>
  );
}
