import type { Metadata } from "next";
import { requireUser } from "@/lib/server-api";
import { LanguageSettings } from "./LanguageSettings";

export const metadata: Metadata = { title: "Settings · Language" };

export default async function SettingsLanguagePage() {
  const user = await requireUser("/settings/language");
  return <LanguageSettings user={user} />;
}
