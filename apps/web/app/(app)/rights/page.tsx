import type { Metadata } from "next";
import type { RightCategory } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { RightsBrowser } from "./RightsBrowser";
import styles from "./rights.module.css";

export const metadata: Metadata = { title: "Browse rights" };

export default async function RightsPage() {
  await requireUser("/rights");
  const categories = await loadOrHandle<RightCategory[]>("/api/v1/rights", "/rights");

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <span className="eyebrow-mono">Statute browser</span>
        <h1>Browse rights</h1>
        <p>The Acts loaded on this server, grouped by the situation they cover.</p>
      </header>
      <RightsBrowser initial={categories} />
    </div>
  );
}
