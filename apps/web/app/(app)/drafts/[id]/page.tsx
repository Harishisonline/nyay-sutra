import type { Metadata } from "next";
import type { Draft } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { Editor } from "./Editor";

export const metadata: Metadata = { title: "Draft" };

export default async function DraftEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/drafts/${id}`;
  await requireUser(path);
  const draft = await loadOrHandle<Draft>(`/api/v1/drafts/${id}`, path);
  return <Editor initial={draft} />;
}
