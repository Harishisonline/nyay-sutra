import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server-api";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/onboarding");
  if (user.onboarding_completed) redirect("/home");
  return <OnboardingForm user={user} />;
}
