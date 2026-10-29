export const SESSION_COOKIE = "ns_token";
export const ONBOARDING_SKIP_COOKIE = "ns_onb_skip";
export const THEME_COOKIE = "nyay-theme";

export const API_URL = process.env.API_URL ?? "http://localhost:8000";

export const PROTECTED_PREFIXES = [
  "/home",
  "/onboarding",
  "/ask",
  "/chats",
  "/drafts",
  "/rights",
  "/settings",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only same-origin absolute paths are accepted as a post-sign-in destination. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/signin") || next.startsWith("/api/")) return null;
  return next;
}

function decodeBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

/**
 * Cheap structural + expiry check used by the edge proxy. The signature is
 * verified by the API on every request; this only avoids rendering a protected
 * page for an obviously absent or expired token.
 */
export function tokenLooksValid(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { exp?: unknown };
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
