"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { RightCategory } from "@nyay/shared";
import { HttpError, api } from "@/lib/api";
import styles from "./rights.module.css";

export function RightsBrowser({ initial }: { initial: RightCategory[] }) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  function onSearch(value: string) {
    setQuery(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const q = value.trim();
      api
        .rights(q || undefined)
        .then((rows) => {
          setItems(rows);
          setNotice(null);
        })
        .catch((err: unknown) => setNotice(err instanceof HttpError ? err.message : "Could not search rights."));
    }, 300);
  }

  const shown = active === "all" ? items : items.filter((item) => item.id === active);
  const feature = shown.find((item) => item.id === "tenancy") ?? shown[0];
  const rest = shown.filter((item) => item.id !== feature?.id);

  return (
    <>
      <label className={styles.search}>
        <span aria-hidden="true">⌕</span>
        <input value={query} aria-label="Search rights" placeholder="Search acts and topics" onChange={(e) => onSearch(e.target.value)} />
      </label>
      <div className={styles.filters} role="toolbar" aria-label="Filter rights">
        <button type="button" className={styles.chip} aria-pressed={active === "all"} onClick={() => setActive("all")}>
          All
        </button>
        {initial.map((item) => (
          <button key={item.id} type="button" className={styles.chip} aria-pressed={active === item.id} onClick={() => setActive(item.id)}>
            {item.title}
          </button>
        ))}
      </div>
      {notice && (
        <p className={styles.alert} role="alert">
          {notice}
        </p>
      )}
      {shown.length === 0 && <p className={styles.empty}>{query.trim() ? `No rights match '${query.trim()}'.` : "No rights in this category."}</p>}
      {feature && (
        <Link href={`/rights/${feature.id}`} className={styles.feature}>
          <span>{feature.acts.length} acts · {feature.section_count} sections</span>
          <h2>{feature.title}</h2>
          <p>{feature.summary}</p>
        </Link>
      )}
      <div className={styles.grid}>
        {rest.map((item) => (
          <Link key={item.id} href={`/rights/${item.id}`} className={styles.card}>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <span>
              {item.acts.length} {item.acts.length === 1 ? "act" : "acts"} · {item.section_count} sections
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
