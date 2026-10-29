import Link from "next/link";

const DESTINATIONS = [
  { href: "/ask", label: "Ask a question" },
  { href: "/chats", label: "Chats" },
  { href: "/drafts", label: "Drafts" },
  { href: "/rights", label: "Browse rights" },
];

export default function NotFound() {
  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
      <p className="eyebrow-mono">Section not found</p>
      <h1 style={{ fontSize: "clamp(2rem, 1.4rem + 2vw, 3rem)", letterSpacing: "-0.03em" }}>
        This page is not in the statute book.
      </h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: "46ch" }}>
        The address does not match a page in NYAY-SUTRA. These destinations do.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
        <Link href="/ask" className="btn-primary">
          Ask a question →
        </Link>
        <Link href="/home" className="btn-secondary">
          Go home
        </Link>
      </div>
      <ul style={{ paddingLeft: 18 }}>
        {DESTINATIONS.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
