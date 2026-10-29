import type { Metadata } from "next";
import type { DraftTemplate } from "@nyay/shared";
import { requireUser } from "@/lib/server-api";
import { CreateDraft, TemplatePicker } from "./picker";
import styles from "../drafts.module.css";

export const metadata: Metadata = { title: "New draft" };

const TEMPLATES: { id: DraftTemplate; title: string; body: string }[] = [
  {
    id: "rti",
    title: "RTI application",
    body: "Ask a public authority for information under Section 6(1) of the Right to Information Act, 2005.",
  },
  {
    id: "consumer",
    title: "Consumer complaint",
    body: "File with the District Commission under Section 35 of the Consumer Protection Act, 2019.",
  },
  {
    id: "tenancy",
    title: "Tenancy notice",
    body: "Write to a landlord about a deposit, a repair, or an essential supply under the Maharashtra Rent Control Act, 1999.",
  },
  {
    id: "generic",
    title: "Generic letter",
    body: "Start from a blank letter when none of the templates fit.",
  },
];

export default async function NewDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ blank?: string; fromChatId?: string }>;
}) {
  await requireUser("/drafts/new");
  const { blank, fromChatId } = await searchParams;

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <span className="eyebrow-mono">New draft</span>
        <h1>Choose a template</h1>
        <p>The editor opens with the sections filled in. You can change every line.</p>
      </header>
      {(blank === "1" || fromChatId) && <CreateDraft fromChatId={fromChatId} blank={blank === "1"} />}
      <TemplatePicker templates={TEMPLATES} />
    </div>
  );
}
