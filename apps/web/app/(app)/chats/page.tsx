import type { Metadata } from "next";
import type { ChatSummary } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { ChatList } from "./ChatList";
import styles from "./chats.module.css";

export const metadata: Metadata = { title: "Chats" };

export default async function ChatsPage() {
  await requireUser("/chats");
  const chats = await loadOrHandle<ChatSummary[]>("/api/v1/chats", "/chats");

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <span className="eyebrow-mono">Your conversations</span>
        <h1>Chats</h1>
        <p>Every question you ask is a separate chat with its own context. Pick up where you left off.</p>
      </header>
      <ChatList initial={chats} />
    </div>
  );
}
