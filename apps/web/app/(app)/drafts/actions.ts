"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Draft, DraftCreate } from "@nyay/shared";
import { API_URL, SESSION_COOKIE } from "@/lib/session";

const inflight = new Map<string, Promise<string>>();

async function postDraft(body: DraftCreate): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API_URL}/api/v1/drafts`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(problem?.detail || "Could not create that draft.");
  }
  const draft = (await res.json()) as Draft;
  return draft.id;
}

/** Creates one draft even if the page effect runs twice, then opens the editor. */
export async function createDraftAction(body: DraftCreate): Promise<void> {
  const key = body.from_chat_id || body.template || "generic";
  let job = inflight.get(key);
  if (!job) {
    job = postDraft(body);
    inflight.set(key, job);
    setTimeout(() => inflight.delete(key), 8000);
  }
  const id = await job;
  redirect(`/drafts/${id}`);
}
