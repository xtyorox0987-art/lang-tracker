export type Category = "active" | "passive" | "anki";

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

export interface ActiveTimer {
  category: "active" | "passive";
  startTime: number;
  isRunning: boolean;
}

export interface AppSettings {
  ankiConnectUrl: string;
  weekStartsOn: 0 | 1; // 0=Sun, 1=Mon
  dailyGoalMinutes: number; // 0 = disabled
}

export const DEFAULT_SETTINGS: AppSettings = {
  ankiConnectUrl: "http://localhost:8765",
  weekStartsOn: 1,
  dailyGoalMinutes: 0,
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
