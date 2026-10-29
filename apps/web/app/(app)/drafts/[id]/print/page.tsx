import type { Metadata } from "next";
import type { Draft } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { LANGUAGE_LABEL } from "@/lib/format";
import { BrandLogo } from "@/components/BrandLogo";
import { PrintButton } from "../PrintButton";
import styles from "../../drafts.module.css";

export const metadata: Metadata = { title: "Print draft" };

export default async function DraftPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/drafts/${id}/print`;
  await requireUser(path);
  const draft = await loadOrHandle<Draft>(`/api/v1/drafts/${id}`, path);

  return (
    <article className={styles.print}>
      <BrandLogo />
      <h1>{draft.title}</h1>
      <p className={styles.printMeta}>{LANGUAGE_LABEL[draft.language]}</p>
      {draft.recipient && (
        <section>
          <h2>To</h2>
          <p>{draft.recipient}</p>
        </section>
      )}
      {draft.subject && (
        <section>
          <h2>Subject</h2>
          <p>{draft.subject}</p>
        </section>
      )}
      <section className={styles.printBody}>
        {draft.body.split("\n").map((line, i) => (
          <p key={i}>{line || "\u00a0"}</p>
        ))}
      </section>
      <p className={styles.printSign}>Signature</p>
      <PrintButton className={`btn-primary ${styles.printBtn}`} />
    </article>
  );
}
