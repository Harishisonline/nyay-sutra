import type { Metadata } from "next";
import { requireUser } from "@/lib/server-api";
import { AskComposer } from "./AskComposer";
import styles from "./ask.module.css";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chat?: string }>;
}) {
  const user = await requireUser("/ask");
  const { q, chat } = await searchParams;
  const initial = typeof q === "string" ? q : "";
  const chatId = typeof chat === "string" && chat ? chat : undefined;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className="eyebrow-mono">Step 1 of 2 · Ask</div>
        <h1>
          What do you want to <em>know</em>?
        </h1>
        <p className={styles.lede}>
          Type your question below, or tap the microphone and speak. NYAY-SUTRA will find the exact law that covers
          your situation.
        </p>
      </header>
      <AskComposer user={user} initialQuestion={initial} chatId={chatId} />
    </div>
  );
}
