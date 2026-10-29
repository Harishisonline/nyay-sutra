import type { Metadata } from "next";
import Link from "next/link";
import type { ChatSummary, Draft } from "@nyay/shared";
import { RecentChatCard, RecentDraftCard } from "@/components/RecentCards";
import { firstName, greetingFor } from "@/lib/format";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "Home" };

const DESTINATIONS = [
  { href: "/ask", icon: "\u2696", title: "Ask a question", body: "Type or speak it. Get the Act, the section, and what to do next.", primary: true },
  { href: "/chats", icon: "\u270B", title: "Your chats", body: "Every question you have asked, with the context it was asked in." },
  { href: "/drafts", icon: "\u270E", title: "My drafts", body: "Complaint notices and applications you can download and send." },
  { href: "/rights", icon: "\u2637", title: "Browse rights", body: "Tenancy, consumer, women and child, RTI, wages, health, family." },
] as const;

export default async function HomePage() {
  const user = await requireUser("/home");
  const [chats, drafts] = await Promise.all([
    loadOrHandle<ChatSummary[]>("/api/v1/chats?limit=2", "/home"),
    loadOrHandle<Draft[]>("/api/v1/drafts", "/home"),
  ]);
  const place = [user.district, user.area].filter(Boolean).join(", ");

  return (
    <div className="container">
      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className="eyebrow-mono">{greetingFor()}</div>
            <h1 className={styles.h1}>
              Namaskar, <em>{firstName(user.name)}</em>.
            </h1>
          </div>
          <Link href="/settings" className={styles.location} title="Change location in your profile">
            <span aria-hidden="true">&#8982;</span>
            {user.state}
            {place ? ` · ${place}` : ""}
          </Link>
        </div>
        <p className={styles.lede}>
          Ask about any legal situation in your language. Get the law that applies, and a draft you can send.
        </p>
      </section>

      <section className={styles.dest} aria-labelledby="dest-title">
        <div className={styles.destHead}>
          <h2 id="dest-title">Where would you like to go?</h2>
          <p>Everything you need, one tap away.</p>
        </div>
        <div className={styles.destGrid}>
          {DESTINATIONS.map((d) => (
            <Link key={d.href} href={d.href} className={`${styles.destCard} ${"primary" in d ? styles.primary : ""}`}>
              <div className={styles.destIcon} aria-hidden="true">
                {d.icon}
              </div>
              <h3>{d.title}</h3>
              <p>{d.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="recent-chats">
        <div className={styles.sectionHead}>
          <h2 id="recent-chats">Recent chats</h2>
          <Link href="/chats">All chats &rarr;</Link>
        </div>
        {chats.length ? (
          <div className={styles.recentGrid}>
            {chats.slice(0, 2).map((c) => (
              <RecentChatCard key={c.id} chat={c} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyRow}>
            <span>No chats yet. Your questions and their answers will appear here.</span>
            <Link href="/ask" className="btn-secondary">
              Ask your first question
            </Link>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="recent-drafts">
        <div className={styles.sectionHead}>
          <h2 id="recent-drafts">Recent drafts</h2>
          <Link href="/drafts">All drafts &rarr;</Link>
        </div>
        {drafts.length ? (
          <div className={styles.recentGrid}>
            {drafts.slice(0, 2).map((d) => (
              <RecentDraftCard key={d.id} draft={d} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyRow}>
            <span>No drafts yet. Turn any answer into a complaint or notice in one tap.</span>
            <Link href="/drafts/new" className="btn-secondary">
              Start a draft
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
