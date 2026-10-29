import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ChatDetail } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { Session } from "./Session";

export const metadata: Metadata = { title: "Answer" };

export default async function AskResultsPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const path = `/ask/results/${chatId}`;
  await requireUser(path);
  const chat = await loadOrHandle<ChatDetail>(`/api/v1/chats/${chatId}`, path);
  const assistants = chat.messages.filter((m) => m.role === "assistant");
  if (assistants.length === 0) redirect(`/ask?chat=${encodeURIComponent(chat.id)}`);
  if (!assistants.some((m) => !m.was_low_confidence)) redirect(`${path}/error`);

  return <Session chat={chat} />;
}
