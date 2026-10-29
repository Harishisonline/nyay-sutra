"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./AppNav.module.css";

const LINKS = [
  { href: "/home", label: "Home", match: (p: string) => p === "/home" },
  { href: "/ask", label: "Ask", match: (p: string) => p === "/ask" || p.startsWith("/ask/") },
  { href: "/chats", label: "Chats", match: (p: string) => p.startsWith("/chats") },
  { href: "/rights", label: "Browse rights", match: (p: string) => p.startsWith("/rights") },
  { href: "/drafts", label: "My drafts", match: (p: string) => p.startsWith("/drafts") },
] as const;

export function AppNav() {
  const pathname = usePathname() ?? "";
  const settingsActive = pathname.startsWith("/settings");
  return (
    <header className={`nav ${styles.appNav}`}>
      <div className="container nav-inner">
        <Link href="/home" className="brand" aria-label="NYAY-SUTRA home">
          <BrandLogo decorative />
        </Link>
        <nav className={styles.links} aria-label="Primary">
          {LINKS.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`${styles.link} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="nav-utility">
          <ThemeToggle />
          <Link
            href="/settings"
            className={`nav-icon-btn ${settingsActive ? "active" : ""}`}
            aria-label="Settings"
            title="Settings"
            aria-current={settingsActive ? "page" : undefined}
          >
            <span aria-hidden="true">&#9881;</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
