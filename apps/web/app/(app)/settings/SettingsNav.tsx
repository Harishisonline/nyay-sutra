"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./settings.module.css";

const ITEMS = [
  { href: "/settings", icon: "\u25C9", label: "Profile" },
  { href: "/settings/language", icon: "\u2318", label: "Language" },
  { href: "/settings/notifications", icon: "\u2690", label: "Notifications" },
  { href: "/settings/account", icon: "\u26BF", label: "Account" },
  { href: "/settings/privacy", icon: "\u2662", label: "Privacy" },
  { href: "/settings/about", icon: "\u2317", label: "About" },
] as const;

export function SettingsNav() {
  const pathname = usePathname() ?? "";
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // On phones the list is a horizontal strip; keep the current tab visible without moving the page.
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current=page]");
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    const l = list.getBoundingClientRect();
    const c = current.getBoundingClientRect();
    list.scrollLeft += c.left - l.left - (l.width - c.width) / 2;
  }, [pathname]);

  return (
    <nav className={styles.sideNav} aria-label="Settings">
      <div className={styles.sideLabel}>Settings</div>
      <ul ref={listRef} className={styles.sideList}>
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.sideItem} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.sideIcon} aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
