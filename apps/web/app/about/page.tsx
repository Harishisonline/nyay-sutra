import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./about.module.css";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand} aria-label="NYAY-SUTRA home">
          <BrandLogo decorative />
        </Link>
        <div className={styles.barActions}>
          <ThemeToggle />
          <Link href="/signin" className="btn-primary">
            Sign in
          </Link>
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <p className="eyebrow-mono">About</p>
        <h1>Know the section that applies, in plain language.</h1>
        <p className={styles.lede}>
          NYAY-SUTRA is a rights assistant for people in Maharashtra. It retrieves statute text, asks a model to
          answer only from those sections, and refuses when it cannot cite them.
        </p>

        <div className={styles.stats}>
          <div>
            <strong>12</strong>
            <span>Acts in the seed corpus</span>
          </div>
          <div>
            <strong>48</strong>
            <span>Sections indexed</span>
          </div>
          <div>
            <strong>₹0</strong>
            <span>To ask a question</span>
          </div>
          <div>
            <strong>2</strong>
            <span>Citations required before an answer is shown</span>
          </div>
        </div>

        <section id="how">
          <h2>How an answer is produced</h2>
          <ol className={styles.steps}>
            <li>Your question is embedded and matched against the statute sections.</li>
            <li>The top sections are sent to Groq. Gemini is the fallback when that key is configured.</li>
            <li>The answer is shown only when it cites at least two sections that were actually retrieved.</li>
          </ol>
        </section>

        <section id="disclaimer">
          <h2>Disclaimer</h2>
          <p>
            NYAY-SUTRA is not a lawyer and this is not legal advice. A cited section is a starting point. For a
            hearing, a deadline, or a risk of arrest, speak to a practicing advocate or your District Legal Services
            Authority. The National Legal Services Authority helpline is 15100.
          </p>
        </section>

        <section id="terms">
          <h2>Terms</h2>
          <p>
            You may use the app to read statutes and draft letters for your own situation. Do not present an answer
            as a court order. Drafts you mark as sent stay locked in the app. You can download a copy before that.
          </p>
        </section>

        <section id="privacy">
          <h2>Privacy</h2>
          <p>
            Questions, drafts, and the last four digits of a phone number are stored for the signed-in account.
            Aadhaar numbers are not stored. Audio is not kept after transcription. Voice for Marathi and Hindi is
            off until a Bhashini key is configured. English transcription, when used, is sent to the Hugging Face
            inference API. Answers are sent to Groq.
          </p>
        </section>

        <p className={styles.cta}>
          <Link href="/signin?next=/ask" className="btn-primary">
            Ask a question
          </Link>
        </p>
      </main>
    </div>
  );
}
