"use client";

import { useRouter } from "next/navigation";
import type { SaveState } from "./useAutoSave";
import styles from "./settings.module.css";

const TEXT: Record<Exclude<SaveState["kind"], "error">, string> = {
  idle: "Changes are saved automatically.",
  saving: "Saving\u2026",
  saved: "All changes saved.",
};

export function SaveBar({ state, dirty, onUndo }: { state: SaveState; dirty: boolean; onUndo: () => void }) {
  const router = useRouter();
  const tone = state.kind === "error" ? styles.error : state.kind === "saved" ? styles.saved : "";
  return (
    <div className={styles.saveBar}>
      <span className={`${styles.saveText} ${tone}`} role="status" aria-live="polite">
        {state.kind === "saving" && <span className="spinner" aria-hidden="true" />}
        {state.kind === "error" ? `Could not save. ${state.message}` : TEXT[state.kind]}
      </span>
      <div className={styles.saveActions}>
        <button type="button" className={styles.linkBtn} onClick={onUndo} disabled={!dirty}>
          Undo changes
        </button>
        <button
          type="button"
          className={`btn-primary ${styles.btnSmall}`}
          onClick={() => {
            router.push("/home");
            router.refresh();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
