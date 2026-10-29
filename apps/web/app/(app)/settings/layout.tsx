import type { ReactNode } from "react";
import { SettingsNav } from "./SettingsNav";
import styles from "./settings.module.css";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container">
      <div className={styles.layout}>
        <SettingsNav />
        <div>{children}</div>
      </div>
    </div>
  );
}
