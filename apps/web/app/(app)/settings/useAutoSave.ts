"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HttpError } from "@/lib/api";

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Local state for a settings form that persists every change as it happens.
 * `set` changes local state only (text inputs before blur); `commit` saves now;
 * `commitLater` coalesces rapid changes (sliders) into one request.
 * `undo` restores every field to the value it had when the page loaded.
 */
export function useAutoSave<T extends object>(initial: T, persist: (patch: Partial<T>) => Promise<unknown>) {
  const [baseline] = useState(initial);
  const lastSaved = useRef<T>(initial);
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const seq = useRef(0);
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (patch: Partial<T>) => {
      const keys = Object.keys(patch) as Array<keyof T>;
      if (keys.every((k) => patch[k] === lastSaved.current[k])) return;
      const id = ++seq.current;
      setState({ kind: "saving" });
      try {
        await persist(patch);
        lastSaved.current = { ...lastSaved.current, ...patch };
        if (id === seq.current) setState({ kind: "saved" });
      } catch (err) {
        const message = err instanceof HttpError ? err.message : "Check your connection and try again.";
        setState({ kind: "error", message });
      }
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const set = useCallback((patch: Partial<T>) => setValue((v) => ({ ...v, ...patch })), []);

  const commit = useCallback(
    (patch: Partial<T>) => {
      setValue((v) => ({ ...v, ...patch }));
      return save(patch);
    },
    [save],
  );

  const commitLater = useCallback(
    (patch: Partial<T>, ms = 500) => {
      setValue((v) => ({ ...v, ...patch }));
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const next = pending.current;
        pending.current = {};
        void save(next);
      }, ms);
    },
    [save],
  );

  const changedKeys = (Object.keys(baseline) as Array<keyof T>).filter(
    (k) => value[k] !== baseline[k],
  );

  const undo = useCallback(async () => {
    const restore: Partial<T> = {};
    for (const k of changedKeys) restore[k] = baseline[k];
    setValue(baseline);
    if (changedKeys.length) await save(restore);
  }, [baseline, changedKeys, save]);

  return { value, set, commit, commitLater, undo, dirty: changedKeys.length > 0, state };
}
