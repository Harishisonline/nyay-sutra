import type { Metadata } from "next";
import Link from "next/link";
import type { RightCategoryDetail } from "@nyay/shared";
import { loadOrHandle, requireUser } from "@/lib/server-api";
import styles from "../rights.module.css";

export const metadata: Metadata = { title: "Rights" };

export default async function RightCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const path = `/rights/${category}`;
  await requireUser(path);
  const detail = await loadOrHandle<RightCategoryDetail>(`/api/v1/rights/${category}`, path);

  return (
    <div className={`container ${styles.page}`}>
      <Link href="/rights" className={styles.back}>
        ← All rights
      </Link>
      <header className={styles.head}>
        <span className="eyebrow-mono">{detail.section_count} sections</span>
        <h1>{detail.title}</h1>
        <p>{detail.summary}</p>
      </header>
      <ul className={styles.acts}>
        {detail.acts.map((act) => (
          <li key={act.act_id}>
            {act.official_url ? (
              <a href={act.official_url} target="_blank" rel="noopener noreferrer">
                {act.full_name}
              </a>
            ) : (
              act.full_name
            )}
            <span>
              {act.sections} {act.sections === 1 ? "section" : "sections"}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.sections}>
        {detail.sections.map((section) => (
          <article key={`${section.act_id}-${section.section}`} id={`s-${section.act_id}-${section.section}`}>
            <h2>
              {section.act_name}, section {section.section}
            </h2>
            {section.title && <p className={styles.sectionTitle}>{section.title}</p>}
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
