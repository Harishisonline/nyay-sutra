import type { Metadata } from "next";
import type { Draft } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { DraftList } from "./DraftList";
import styles from "./drafts.module.css";

export const metadata: Metadata = { title: "Drafts" };

export default async function DraftsPage() {
  await requireUser("/drafts");
  const drafts = await loadOrHandle<Draft[]>("/api/v1/drafts", "/drafts");

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <span className="eyebrow-mono">Complaint drafts</span>
        <h1>Drafts</h1>
        <p>Notices and applications you can edit, download, and mark as sent.</p>
      </header>
      <DraftList initial={drafts} />
    </div>
  );
}
