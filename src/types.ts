export type Category = "active" | "passive" | "anki";

export type ListeningMode = "active" | "passive";

export type VideoResourceSource =
  | "manual"
  | "youtube-extension"
  | "agent"
  | "import";

export type VideoResourceStatus =
  | "candidate"
  | "watching"
  | "watched"
  | "dismissed";

export type DeckRole =
  | "foundation"
  | "foundationRemaining"
  | "youtubeChannel"
  | "other";

export type RecommendationConfidence = "low" | "medium" | "high";

export type RecommendationReasonKind =
  | "routine"
  | "deck"
  | "time"
  | "comprehension"
  | "novelty"
  | "channel"
  | "mentalLoad";

export interface TimeEntry {
  id: string;
  category: Category;
  startTime: number; // Unix timestamp ms
  endTime: number; // Unix timestamp ms
  duration: number; // seconds
  source: "manual" | "anki-sync";
  note?: string;
  createdAt: number;
}

export interface AnkiSnapshot {
  id: string;
  date: string; // 'YYYY-MM-DD'
  syncedAt: number;
  reviewCount: number;
  reviewTimeMs: number;
  matureCount: number;
  youngCount: number;
  newCount: number;
}

export interface VideoResource {
  id: string;
  url: string;
  videoId?: string;
  title: string;
  channel: string;
  channelGroup?: string;
  genre?: string;
  deckNumber?: number;
  linkedDeckName?: string;
  durationSec?: number;
  source: VideoResourceSource;
  manualDifficulty?: 1 | 2 | 3 | 4 | 5;
  comprehensibilityPct?: number;
  tags?: string[];
  status: VideoResourceStatus;
  createdAt: number;
  updatedAt: number;
  dismissedAt?: number;
  watchedAt?: number;
}

export interface VideoWatchSession {
  id: string;
  resourceId?: string;
  videoId?: string;
  title: string;
  channel?: string;
  url?: string;
  startTime: number;
  endTime: number;
  duration: number;
  listeningMode: ListeningMode;
  completionPct?: number;
  source: "manual" | "youtube-extension";
  createdAt: number;
}

export interface DeckProgressSnapshot {
  id: string;
  deckName: string;
  role: DeckRole;
  deckNumber?: number;
  newCount: number;
  learnCount: number;
  reviewCount: number;
  dueCount: number;
  totalCount: number;
  syncedAt: number;
}

export interface RecommendationReason {
  kind: RecommendationReasonKind;
  label: string;
  detail: string;
  weight: number;
}

export interface RecommendationResult {
  resource: VideoResource;
  score: number;
  reasons: RecommendationReason[];
  risks: string[];
  nextAction: string;
  confidence: RecommendationConfidence;
}

export interface RecommendationContext {
  routineDay: 1 | 2 | 3;
  newCardsTarget: 10 | 20;
  activeSecondsToday: number;
  activeGoalSeconds: number;
  focus: DeckRole;
  needsYoutubeBeforeAnki: boolean;
  hasDeckProgress: boolean;
}

export interface ActiveTimer {
  category: "active" | "passive";
  startTime: number;
  isRunning: boolean;
}

export interface AppSettings {
  ankiConnectUrl: string;
  weekStartsOn: 0 | 1; // 0=Sun, 1=Mon
  dailyGoalMinutes: number; // 0 = disabled
  recommendationRoutineStartDate: string; // '' = today anchors the 3-day loop
  recommendationSelectedChannel: string;
  recommendationMaxSuggestions: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ankiConnectUrl: "http://localhost:8765",
  weekStartsOn: 1,
  dailyGoalMinutes: 0,
  recommendationRoutineStartDate: "",
  recommendationSelectedChannel: "",
  recommendationMaxSuggestions: 3,
};

export const CATEGORY_LABELS: Record<Category, string> = {
  active: "Active",
  passive: "Passive",
  anki: "Anki",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  active: "#ff6bcb", // vibrant pink
  passive: "#22d3ee", // vivid cyan
  anki: "#34d399", // bright emerald
};

/** ローカルタイムゾーンで "YYYY-MM-DD" を返す（toISOStringはUTC基準で日付がズレるため） */
export function toLocalDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
