import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { UserProfile } from "@nyay/shared";
import { API_URL, ONBOARDING_SKIP_COOKIE, SESSION_COOKIE } from "./session";

export class ApiFetchError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: "application/json", ...(await authHeader()) },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiFetchError(`GET ${path} failed with ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Fetch a resource for a page. 401 sends the user to sign in, 404 renders the not-found page. */
export async function loadOrHandle<T>(path: string, currentPath: string): Promise<T> {
  try {
    return await apiGet<T>(path);
  } catch (err) {
    if (err instanceof ApiFetchError) {
      if (err.status === 401) redirect(`/signin?next=${encodeURIComponent(currentPath)}`);
      if (err.status === 404 || err.status === 422) notFound();
    }
    throw err;
  }
}

/** Returns the signed-in user, or null when signed out or the token was rejected. */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const header = await authHeader();
  if (!header.Authorization) return null;
  try {
    return await apiGet<UserProfile>("/api/v1/users/me");
  } catch (err) {
    if (err instanceof ApiFetchError && err.status === 401) return null;
    throw err;
  }
}

/** For authenticated app pages: guarantees a user and enforces onboarding. */
export async function requireUser(currentPath: string): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(currentPath)}`);
  if (!user.onboarding_completed) {
    const jar = await cookies();
    if (jar.get(ONBOARDING_SKIP_COOKIE)?.value !== "1") redirect("/onboarding");
  }
  return user;
}
