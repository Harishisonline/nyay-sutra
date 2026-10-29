import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server-api";
import { safeNext } from "@/lib/session";
import { BrandLogo } from "@/components/BrandLogo";
import { SignInForm } from "./SignInForm";
import styles from "./signin.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = safeNext(next);
  const user = await getCurrentUser();
  if (user) redirect(user.onboarding_completed ? (destination ?? "/home") : "/onboarding");

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel}>
        <div className={`${styles.orb} ${styles.orb1}`} />
        <div className={`${styles.orb} ${styles.orb2}`} />
        <div className={styles.brandContent}>
          <div className={styles.brandTop}>
            <BrandLogo size="hero" />
          </div>
          <div className={styles.brandQuote}>
            <h2>
              Know your rights,
              <br />
              in <em>your language</em>.
            </h2>
            <p>
              A voice-first legal assistant for Maharashtra citizens. Ask in Marathi, Hindi, Hinglish, or English. Get
              the exact law that covers your situation.
            </p>
            <div className={styles.brandStats}>
              <div>
                <div className={styles.statValue}>12+</div>
                <div className={styles.statLabel}>Indian Acts</div>
              </div>
              <div>
                <div className={styles.statValue}>3</div>
                <div className={styles.statLabel}>Languages</div>
              </div>
              <div>
                <div className={styles.statValue}>₹0</div>
                <div className={styles.statLabel}>Cost / query</div>
              </div>
            </div>
          </div>
          <div className={styles.brandFoot}>Built for the SEVA First Innovation Challenge 2026, Maharashtra Zone.</div>
        </div>
      </aside>
      <main id="main" className={styles.formPanel}>
        <SignInForm next={destination} />
      </main>
    </div>
  );
}
