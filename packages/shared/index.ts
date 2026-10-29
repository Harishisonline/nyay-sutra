/**
 * Shared API contract between web (Next.js) and api (FastAPI).
 * Mirrored by hand in apps/api/app/models/schemas.py. Keep both in sync.
 */

export type Language = "english" | "hinglish" | "marathi" | "hindi";
export const LANGUAGES: readonly Language[] = ["english", "hinglish", "marathi", "hindi"];

export type Gender = "female" | "male" | "nonbinary" | "undisclosed" | "other";

export type Category =
  | "tenancy"
  | "consumer"
  | "women_child"
  | "rti"
  | "health"
  | "wages"
  | "education"
  | "criminal"
  | "family"
  | "cyber"
  | "other";

export type DraftStatus = "draft" | "ready" | "sent";
export type DraftTemplate = "rti" | "consumer" | "tenancy" | "generic";
export type ImproveAction = "regenerate" | "make_formal" | "make_simpler" | "add_citations" | "custom";
export type ModelProvider = "groq" | "gemini" | "offline";

export interface NotificationPrefs {
  legal_updates: boolean;
  email_digest: boolean;
  sms_reminders: boolean;
  state_schemes: boolean;
  weekly_digest: boolean;
  chat_reminders: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

export interface PrivacyPrefs {
  anonymous_by_default: boolean;
  save_chat_history: boolean;
  help_improve: boolean;
  use_profile_personalisation: boolean;
  retention_days: number;
}

export interface UserProfile {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  age: number | null;
  gender: Gender | null;
  state: string;
  district: string | null;
  area: string | null;
  preferred_language: Language;
  preferred_voice_language: Language;
  voice_playback: boolean;
  onboarding_completed: boolean;
  aadhaar_last4: string | null;
  created_at: string;
  notifications: NotificationPrefs;
  privacy: PrivacyPrefs;
}

export interface ProfileUpdate {
  name?: string | null;
  age?: number | null;
  gender?: Gender | null;
  state?: string;
  district?: string | null;
  area?: string | null;
  preferred_language?: Language;
  preferred_voice_language?: Language;
  voice_playback?: boolean;
  onboarding_completed?: boolean;
}

export interface RequestOtpResponse {
  sent: boolean;
  expires_in: number;
  resend_after: number;
  /** Present only when the API runs the local dev OTP backend. Never in production. */
  dev_code?: string;
}

export interface VerifyOtpResponse {
  access_token: string;
  expires_in: number;
  is_new_user: boolean;
  user: UserProfile;
}

export interface Citation {
  index: number;
  act_id: string;
  act_name: string;
  section: string;
  section_title: string;
  excerpt: string;
  source_url: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  category: Category | null;
  confidence: number | null;
  model_provider: ModelProvider | null;
  model_name: string | null;
  latency_ms: number | null;
  retrieval_top_score: number | null;
  was_low_confidence: boolean;
  language: Language | null;
  transcript_language: Language | null;
  transcript_confidence: number | null;
  citations: Citation[];
}

export interface FrozenContext {
  state: string | null;
  city: string | null;
  age: number | null;
  language: Language;
  frozen_at: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  category: Category;
  pinned: boolean;
  context: FrozenContext;
  created_at: string;
  last_activity_at: string;
  snippet: string;
  follow_ups: number;
  sources: number;
  draft_status: DraftStatus | null;
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
}

export interface ChatUpdate {
  title?: string;
  pinned?: boolean;
}

export interface QueryRequest {
  question: string;
  language?: Language;
  chat_id?: string;
  transcript_language?: Language;
  transcript_confidence?: number;
}

export interface RetrievalPreviewItem {
  act_id: string;
  act_name: string;
  section: string;
  title: string;
  score: number;
  source_url: string | null;
}

export interface Diagnostic {
  trace_id: string;
  kind: "low_confidence" | "model_refused" | "citation_missing" | "user_reported";
  question: string;
  retrieval_top_score: number;
  threshold: number;
  retrieval_preview: RetrievalPreviewItem[];
  model_flag: string | null;
  valid_citations: number;
  model_provider: ModelProvider | null;
  model_name: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface QueryAnswered {
  status: "answered";
  chat_id: string;
  user_message: ChatMessage;
  message: ChatMessage;
}

export interface QueryLowConfidence {
  status: "low_confidence";
  chat_id: string;
  message_id: string;
  diagnostic: Diagnostic;
}

export type QueryResponse = QueryAnswered | QueryLowConfidence;

export interface Draft {
  id: string;
  title: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  language: Language;
  template: DraftTemplate | null;
  category: Category;
  status: DraftStatus;
  source_chat_id: string | null;
  source_chat_title: string | null;
  citations: Citation[];
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface DraftCreate {
  template?: DraftTemplate | null;
  from_chat_id?: string | null;
  title?: string;
  language?: Language;
}

export interface DraftUpdate {
  title?: string;
  recipient?: string | null;
  subject?: string | null;
  body?: string;
  status?: Exclude<DraftStatus, "sent">;
}

export interface DraftVersion {
  id: string;
  source: "user_edit" | "template" | "from_chat" | ImproveAction;
  prompt: string | null;
  model_provider: ModelProvider | null;
  body: string;
  created_at: string;
}

export interface ImproveRequest {
  action: ImproveAction;
  prompt?: string;
}

export interface RightAct {
  act_id: string;
  short_name: string;
  full_name: string;
  sections: number;
  official_url: string | null;
}

export interface RightCategory {
  id: Category;
  title: string;
  summary: string;
  icon: string;
  acts: RightAct[];
  section_count: number;
  sample_questions: string[];
}

export interface RightSection {
  act_id: string;
  act_name: string;
  section: string;
  title: string;
  body: string;
  source_url: string | null;
}

export interface RightCategoryDetail extends RightCategory {
  sections: RightSection[];
}

export interface TranscribeResponse {
  text: string;
  language: Language;
  confidence: number;
  provider: "bhashini" | "whisper";
  duration_ms: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  environment: string;
  checks: Record<string, string>;
}

export interface SessionInfo {
  id: string;
  device: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface StorageUsage {
  chats: number;
  messages: number;
  drafts: number;
  voice_recordings: number;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  retry_after?: number;
}
