import type { Category, DraftStatus, Language } from "@nyay/shared";

export const CATEGORY_LABEL: Record<Category, string> = {
  tenancy: "Tenancy",
  consumer: "Consumer",
  women_child: "Women and child",
  rti: "RTI",
  health: "Health",
  wages: "Wages",
  education: "Education",
  criminal: "Criminal",
  family: "Family",
  cyber: "Cyber",
  other: "General",
};

export const LANGUAGE_LABEL: Record<Language, string> = {
  english: "English",
  hinglish: "Hinglish",
  marathi: "Marathi",
  hindi: "Hindi",
};

export const LANGUAGE_NATIVE: Record<Language, string> = {
  english: "English",
  hinglish: "Hinglish",
  marathi: "मराठी",
  hindi: "हिन्दी",
};

export const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  sent: "Sent",
};

const IST = "Asia/Kolkata";

export function greetingFor(date: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: IST }).format(date));
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST }).format(
    new Date(iso),
  );
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: IST }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatShortDate(iso)} ${formatTime(iso)}`;
}

/** "Today · 16:42", "Yesterday · 09:10", or "12 Oct". */
export function relativeStamp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const key = dayKey(d);
  if (key === today) return `Today · ${formatTime(iso)}`;
  if (key === yesterday) return `Yesterday · ${formatTime(iso)}`;
  return formatShortDate(iso);
}

/** "Today", "Yesterday", or "12 Oct". */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const stamp = relativeStamp(iso, now);
  return stamp.split(" · ")[0] ?? stamp;
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Friend";
  return trimmed.split(/\s+/)[0] ?? "Friend";
}

/** "+919876543210" -> "+91 98765 43210". */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: IST }).format(
    new Date(iso),
  );
}

export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}
