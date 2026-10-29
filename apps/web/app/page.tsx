import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/server-api";
import { ONBOARDING_SKIP_COOKIE } from "@/lib/session";
import styles from "./landing.module.css";

// Every internal destination on the landing page is the sign-in route.
const SIGN_IN = "/signin";

const FEATURES = [
  {
    tag: "Ask",
    icon: "\u2696",
    title: "Ask your question",
    body: "Describe your situation in plain words. NYAY-SUTRA searches 12 Indian Acts and gives you the exact law that applies, with the section number, in simple language you can read.",
    cta: "Sign in to ask",
  },
  {
    tag: "Draft",
    icon: "\u270E",
    title: "Draft your complaint",
    body: "Turn any answer into a formal legal notice, RTI application, or consumer complaint. Name it, edit it with AI help, and keep every draft saved to your account.",
    cta: "Sign in to draft",
  },
  {
    tag: "Download",
    icon: "\u2B07",
    title: "Download and submit",
    body: "Every draft downloads as a submitable, print-ready document with a letterhead header, recipient block, and signature space. Print it or send it straight to the department.",
    cta: "Sign in to download",
  },
  {
    tag: "Voice",
    icon: "\u{1F399}",
    title: "Speak instead of typing",
    body: "Tap the mic and ask out loud in Marathi, Hindi, Hinglish, or English. Get the answer read back to you in the same language. Works on a basic phone over 2G.",
    cta: "Sign in to speak",
  },
] as const;

const TOPICS = [
  { icon: "\u2302", title: "Landlord disputes", body: "Eviction without notice, illegal deductions, water or power cuts, deposit refunds." },
  { icon: "\u2696", title: "Consumer fraud", body: "Defective products, denied warranties, hospital overcharging, telecom and banking issues." },
  { icon: "\u2640", title: "Women and child", body: "Domestic violence, dowry, harassment at work, child marriage, sexual harassment." },
  { icon: "\u2318", title: "RTI and civic", body: "Right to Information, government scheme eligibility, denied certificates, ration cards." },
  { icon: "\u271A", title: "Health and medical", body: "Medical negligence, denied insurance claims, hospital discharge disputes." },
  { icon: "\u2692", title: "Wages and labour", body: "Unpaid wages, illegal termination, no PF, workplace safety, contract violations." },
  { icon: "\u2690", title: "Education", body: "RTE admissions, fee hikes, school refusal, scholarship denials." },
  { icon: "\u2605", title: "All other rights", body: "Ask anything. If a law covers it, NYAY-SUTRA will find the section and cite it." },
] as const;

const STEPS = [
  {
    num: "01 / Input",
    title: "Ask by voice or text",
    body: "Type in Marathi, Hindi, or English, or speak in English. No legal English needed, ask it like you would ask a friend.",
  },
  {
    num: "02 / Match",
    title: "Find the right law",
    body: "Your question is matched against 12 Indian statutes, and the answer quotes the section text stored in the corpus.",
  },
  {
    num: "03 / Answer",
    title: "Plain language + citation",
    body: "Groq writes a clear answer. Every claim is tagged with its Act and section number.",
  },
] as const;

const LANGS = [
  { native: "मराठी", en: "Marathi", sample: "\u201Cमाझे मालक पाणी बंद करू शकतात का?\u201D" },
  { native: "हिन्दी", en: "Hindi", sample: "\u201Cक्या मकान मालिक पानी की सप्लाई काट सकता है?\u201D" },
  { native: "English", en: "EN", sample: "\u201CCan my landlord cut water supply if I refuse extra charges?\u201D" },
] as const;

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    const skipped = (await cookies()).get(ONBOARDING_SKIP_COOKIE)?.value === "1";
    redirect(user.onboarding_completed || skipped ? "/home" : "/onboarding");
  }

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <span className={`brand ${styles.brandStatic}`}>
            <BrandLogo />
          </span>
          <div className="nav-utility">
            <Link href="/signin" className={styles.navCta}>
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <div className={`container ${styles.heroGrid}`}>
            <div>
              <span className={styles.eyebrow}>
                <span className={styles.dot} />
                Seva First Innovation Challenge 2026 · Maharashtra
              </span>
              <h1 className={styles.heroTitle}>
                Know your rights,
                <br />
                in <em>your language</em>.
              </h1>
              <p className={styles.heroSub}>
                A voice-first legal rights assistant that reads 12+ Indian statutes and answers your question in
                Marathi, Hindi, Hinglish, or English, with the exact Act and section number, and a one-tap printable
                complaint draft.
              </p>
              <div className={styles.heroCtas}>
                <Link href={SIGN_IN} className={`btn-primary ${styles.heroBtn}`}>
                  Sign in to get started &rarr;
                </Link>
              </div>
              <div className={styles.signinNote}>
                <span className={styles.signinIcon} aria-hidden="true">
                  &#128274;
                </span>
                <p>
                  <strong>Sign in to know your rights in your understanding or comfort language.</strong>
                  <br />
                  Every feature on this page is free and needs an account. Signing in takes 30 seconds with your
                  mobile number.
                </p>
              </div>
              <dl className={styles.stats}>
                <div>
                  <dt className={styles.statValue}>12+</dt>
                  <dd className={styles.statLabel}>Indian Acts</dd>
                </div>
                <div>
                  <dt className={styles.statValue}>3</dt>
                  <dd className={styles.statLabel}>Languages</dd>
                </div>
                <div>
                  <dt className={styles.statValue}>₹0</dt>
                  <dd className={styles.statLabel}>Cost per query</dd>
                </div>
                <div>
                  <dt className={styles.statValue}>&lt; 10s</dt>
                  <dd className={styles.statLabel}>Response time</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.features}`} id="features">
          <div className="container">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>What NYAY-SUTRA does</div>
              <h2 className={styles.h2}>
                Ask. Draft. Download.
                <br />
                Speak.
              </h2>
              <p className={styles.sectionSub}>
                Four ways to find out what the law says about your situation, and what to do about it.
              </p>
            </div>
            <div className={styles.featureGrid}>
              {FEATURES.map((f) => (
                <Link key={f.tag} href={SIGN_IN} className={styles.featureCard}>
                  <div className={styles.featureTop}>
                    <div className={styles.featureIcon} aria-hidden="true">
                      {f.icon}
                    </div>
                    <span className={styles.featureTag}>{f.tag}</span>
                  </div>
                  <h3 className={styles.featureTitle}>{f.title}</h3>
                  <p className={styles.featureBody}>{f.body}</p>
                  <span className={styles.featureLink}>{f.cta} &rarr;</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="topics">
          <div className="container">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>What you can ask</div>
              <h2 className={styles.h2}>
                Six everyday situations,
                <br />
                grounded in actual law.
              </h2>
            </div>
            <div className={styles.rightsStrip}>
              {TOPICS.map((t) => (
                <Link key={t.title} href={SIGN_IN} className={styles.rightTile}>
                  <div className={styles.rightIcon} aria-hidden="true">
                    {t.icon}
                  </div>
                  <h3 className={styles.rightTitle}>{t.title}</h3>
                  <p className={styles.rightBody}>{t.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.subtle}`} id="how">
          <div className="container">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>How it works</div>
              <h2 className={styles.h2}>Three steps. One grounded answer.</h2>
              <p className={styles.sectionSub}>
                Every sentence NYAY-SUTRA writes is anchored to a real statute. It cannot invent a law.
              </p>
            </div>
            <div className={styles.howGrid}>
              {STEPS.map((s) => (
                <div key={s.num} className={styles.howStep}>
                  <span className={styles.howNum}>{s.num}</span>
                  <h3 className={styles.howTitle}>{s.title}</h3>
                  <p className={styles.howBody}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.languages} id="languages">
          <div className="container">
            <div className={styles.sectionHead}>
              <div className={`${styles.sectionEyebrow} ${styles.eyebrowLight}`}>Three languages, one platform</div>
              <h2 className={`${styles.h2} ${styles.h2Light}`}>Talk to it the way you think.</h2>
            </div>
            <div className={styles.langGrid}>
              {LANGS.map((l) => (
                <div key={l.en} className={styles.langCard}>
                  <div className={styles.langNative}>{l.native}</div>
                  <div className={styles.langEn}>{l.en}</div>
                  <div className={styles.langSample}>{l.sample}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerGrid}`}>
          <div>
            <span className="brand">
              <BrandLogo />
            </span>
            <p className={styles.footerTagline}>
              Know your rights, in your language. Open source, free for the people of Maharashtra.
            </p>
          </div>
          <div className={styles.footerCols}>
            <div>
              <div className={styles.footerHeading}>Product</div>
              <Link href={SIGN_IN} className={styles.footerLink}>
                Ask a question
              </Link>
              <a href="#topics" className={styles.footerLink}>
                Browse rights by topic
              </a>
              <a href="#features" className={styles.footerLink}>
                What it does
              </a>
            </div>
            <div>
              <div className={styles.footerHeading}>About</div>
              <Link href={SIGN_IN} className={styles.footerLink}>
                Sign in
              </Link>
              <a href="https://sevainnovationchallenge.in" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                SEVA 2026
              </a>
              <a href="https://indiacode.nic.in" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                India Code source
              </a>
            </div>
            <div>
              <div className={styles.footerHeading}>Languages</div>
              <span className={styles.footerLink}>English</span>
              <span className={styles.footerLink}>मराठी (Marathi)</span>
              <span className={styles.footerLink}>हिन्दी (Hindi)</span>
            </div>
          </div>
        </div>
        <div className={`container ${styles.footerLegal}`}>
          <span>© 2026 NYAY-SUTRA. MIT License.</span>
          <span>Not legal advice. For complex matters, consult a practicing advocate.</span>
        </div>
      </footer>
    </>
  );
}
