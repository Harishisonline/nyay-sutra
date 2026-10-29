import type { Metadata } from "next";
import { requireUser } from "@/lib/server-api";
import { NotificationSettings } from "./NotificationSettings";

export const metadata: Metadata = { title: "Settings · Notifications" };

export default async function SettingsNotificationsPage() {
  const user = await requireUser("/settings/notifications");
  return <NotificationSettings user={user} />;
}
