import type { Metadata } from "next";
import { requireUser } from "@/lib/server-api";
import { PrivacySettings } from "./PrivacySettings";

export const metadata: Metadata = { title: "Settings · Privacy" };

export default async function SettingsPrivacyPage() {
  const user = await requireUser("/settings/privacy");
  return <PrivacySettings user={user} />;
}
