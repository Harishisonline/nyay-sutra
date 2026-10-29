"use client";

import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 760 }}>
      <p className="eyebrow-mono">Temporary failure</p>
      <h1 style={{ fontSize: "clamp(2rem, 1.4rem + 2vw, 3rem)", letterSpacing: "-0.03em" }}>
        The court is in recess. We could not finish that request.
      </h1>
      <dl style={{ display: "grid", gap: 8, margin: "20px 0" }}>
        <div>
          <dt>Reference</dt>
          <dd>{error.digest ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>Web</dd>
        </div>
      </dl>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Try again →
        </button>
        <Link href="/home" className="btn-secondary">
          Go home
        </Link>
      </div>
    </main>
  );
}
