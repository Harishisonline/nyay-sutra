import type { Metadata } from "next";
import type { SessionInfo, StorageUsage } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import { AccountSettings } from "./AccountSettings";

export const metadata: Metadata = { title: "Settings · Account" };

export default async function SettingsAccountPage() {
  const user = await requireUser("/settings/account");
  const [sessions, storage] = await Promise.all([
    loadOrHandle<SessionInfo[]>("/api/v1/users/me/sessions", "/settings/account"),
    loadOrHandle<StorageUsage>("/api/v1/users/me/storage", "/settings/account"),
  ]);
  return <AccountSettings user={user} sessions={sessions} storage={storage} />;
}
