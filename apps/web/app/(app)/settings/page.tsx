import type { Metadata } from "next";
import { requireUser } from "@/lib/server-api";
import { ProfileSettings } from "./ProfileSettings";

export const metadata: Metadata = { title: "Settings · Profile" };

export default async function SettingsProfilePage() {
  const user = await requireUser("/settings");
  return <ProfileSettings user={user} />;
}
