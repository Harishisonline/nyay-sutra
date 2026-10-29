import type { Metadata } from "next";
import Link from "next/link";
import type { HealthResponse } from "@nyay/shared";
import { BrandLogo } from "@/components/BrandLogo";
import { apiGet, requireUser } from "@/lib/server-api";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";
import styles from "../settings.module.css";
import own from "./about.module.css";

export const metadata: Metadata = { title: "Settings · About" };

const CREDITS = [
  { mark: "AI", name: "Groq", detail: "LLM inference" },
  { mark: "G", name: "Google AI", detail: "Gemini fallback" },
  { mark: "B", name: "Bhashini", detail: "Voice, MeitY" },
  { mark: "HF", name: "Hugging Face", detail: "e5 and Whisper" },
  { mark: "Q", name: "Qdrant", detail: "Vector search" },
  { mark: "S", name: "Supabase", detail: "Auth and database" },
  { mark: "IC", name: "India Code", detail: "Statute text" },
  { mark: "V", name: "Vercel", detail: "Web hosting" },
] as const;

function llmLabel(raw: string | undefined): string {
  if (!raw) return "Unavailable";
  if (raw.startsWith("offline")) return "Offline mode (no key)";
  if (raw === "not configured") return "Not configured";
  return raw
    .split(" -> ")
    .map((p) => p.replace(":", " · ").replace("-versatile", ""))
    .join(" → ");
}

function embeddingsLabel(raw: string | undefined): string {
  if (!raw) return "Unavailable";
  if (raw.includes("e5")) return "e5-base multilingual";
  if (raw.startsWith("hash")) return "Test embedder";
  return raw;
}

function voiceLabel(raw: string | undefined): string {
  if (!raw || raw === "not configured") return "Not configured";
  return raw;
}

function corpusLabel(raw: string | undefined): { size: string; date: string } {
  const m = raw ? /^(\d+) acts, (\d+) sections, (\d{4}-\d{2}-\d{2})$/.exec(raw) : null;
  if (!m) return { size: "Unavailable", date: "Unavailable" };
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${m[3]}T00:00:00+05:30`),
  );
  return { size: `${m[1]} acts · ${m[2]} sections`, date };
}

async function loadHealth(): Promise<HealthResponse | null> {
  try {
    return await apiGet<HealthResponse>("/api/v1/health");
  } catch {
    return null;
  }
}

export default async function SettingsAboutPage() {
  await requireUser("/settings/about");
  const health = await loadHealth();
  const corpus = corpusLabel(health?.checks.corpus);
  const build = [
    { label: "App version", value: health ? `v${health.version}` : "Unavailable" },
    { label: "Corpus", value: corpus.size },
    { label: "Corpus updated", value: corpus.date },
    { label: "LLM", value: llmLabel(health?.checks.llm) },
    { label: "Embeddings", value: embeddingsLabel(health?.checks.embeddings) },
    { label: "STT / TTS", value: voiceLabel(health?.checks.voice) },
  ];

  return (
    <>
      <header className={styles.pageHead}>
        <div className="eyebrow-mono">Settings</div>
        <h1>About NYAY-SUTRA</h1>
        <p>What this is, what it runs on, and where the source lives.</p>
      </header>

      <div className={own.hero}>
        <div className={own.heroBrand}>
          <BrandLogo size="hero" />
        </div>
        <h2>
          Legal literacy is a <em>public good</em>.
        </h2>
        <p>
          A voice-first assistant that turns India&apos;s statute books into plain answers, in your language, with the
          Act and section for every claim. Built for the SEVA First Innovation Challenge 2026. Open source under the MIT
          License. Free for the people of Maharashtra.
        </p>
      </div>

      <section className={styles.section} aria-labelledby="build">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="build" className={styles.sectionTitle}>
              Build details
            </h2>
            <p className={styles.sectionDesc}>The version you are on, and what is inside it.</p>
          </div>
        </div>
        <dl className={own.buildGrid}>
          {build.map((b) => (
            <div key={b.label} className={own.cell}>
              <dt>{b.label}</dt>
              <dd>{b.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="new">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="new" className={styles.sectionTitle}>
              What&apos;s new
            </h2>
            <p className={styles.sectionDesc}>The first public build.</p>
          </div>
        </div>
        <div className={own.entry}>
          <div className={own.entryHead}>
            <span className={styles.badge}>v{health?.version ?? "0.4.2"}</span>
            <span className={own.entryDate}>20 Oct 2026</span>
          </div>
          <ul className={own.entryList}>
            <li>Ask by text or voice in English, Hinglish, Marathi or Hindi. Every answer cites the Act and section.</li>
            <li>
              Each chat keeps the location, age and language it was started with, so an old chat reads the same later.
            </li>
            <li>Turn any answer into a complaint or notice draft you can edit, improve and download.</li>
            <li>Privacy controls for chat retention, personalisation and drafts without your name.</li>
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="oss">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="oss" className={styles.sectionTitle}>
              Open source
            </h2>
            <p className={styles.sectionDesc}>MIT-licensed. Read it, fork it, deploy it.</p>
          </div>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Source code</div>
            <div className={own.detail}>{REPO_URL ? REPO_URL.replace(/^https?:\/\//, "") : "Published with the public launch"}</div>
          </div>
          {REPO_URL ? (
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
              Open &rarr;
            </a>
          ) : (
            <span className={styles.statusMuted}>Coming soon</span>
          )}
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>MIT License</div>
            <div className={own.detail}>Free to use, modify and distribute</div>
          </div>
          <a
            href="https://opensource.org/license/mit"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkBtn}
            aria-label="Read the MIT License"
          >
            Read &rarr;
          </a>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Self-host for your district</div>
            <div className={own.detail}>Runs entirely on free tiers. Setup steps are in the README.</div>
          </div>
          {REPO_URL ? (
            <a
              href={`${REPO_URL}#readme`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkBtn}
              aria-label="Read the self-host guide"
            >
              Read &rarr;
            </a>
          ) : (
            <span className={styles.statusMuted}>Coming soon</span>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="credits">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="credits" className={styles.sectionTitle}>
              Credits and data sources
            </h2>
            <p className={styles.sectionDesc}>NYAY-SUTRA stands on the work of many.</p>
          </div>
        </div>
        <ul className={own.credits}>
          {CREDITS.map((c) => (
            <li key={c.name} className={own.credit}>
              <span className={own.creditMark} aria-hidden="true">
                {c.mark}
              </span>
              <span className={own.creditName}>{c.name}</span>
              <span className={own.creditDetail}>{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="legal">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="legal" className={styles.sectionTitle}>
              Legal and compliance
            </h2>
            <p className={styles.sectionDesc}>What NYAY-SUTRA is, and what it is not.</p>
          </div>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Disclaimer</div>
            <div className={own.detail}>
              NYAY-SUTRA is legal information, not legal advice. For court proceedings, consult a licensed advocate or
              your District Legal Services Authority.
            </div>
          </div>
          <Link href="/about#disclaimer" className={styles.linkBtn} aria-label="Read the disclaimer">
            Read &rarr;
          </Link>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Privacy</div>
            <div className={own.detail}>What we collect, what we do not, and who we share it with</div>
          </div>
          <Link href="/settings/privacy" className={styles.linkBtn} aria-label="Read the privacy settings">
            Read &rarr;
          </Link>
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.rowHead}>Government deployment</div>
            <div className={own.detail}>For DLSA and district collectorate pilots</div>
          </div>
          {CONTACT_EMAIL ? (
            <a href={`mailto:${CONTACT_EMAIL}?subject=NYAY-SUTRA%20deployment`} className={styles.linkBtn}>
              Contact &rarr;
            </a>
          ) : (
            <span className={styles.statusMuted}>Contact added at launch</span>
          )}
        </div>
      </section>
    </>
  );
}
