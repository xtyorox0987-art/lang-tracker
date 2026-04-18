import { create } from "zustand";
import type {
  ActiveTimer,
  TimeEntry,
  AnkiSnapshot,
  AppSettings,
} from "../types";
import { DEFAULT_SETTINGS, toLocalDateStr } from "../types";
import {
  addTimeEntry,
  getTimeEntriesForRange,
  getAnkiSnapshotsForRange,
  saveActiveTimer,
  loadActiveTimer,
  clearActiveTimer,
  saveSettings as saveSettingsToDb,
  loadSettings as loadSettingsFromDb,
} from "./repository";

interface AppState {
  // Auth
  userId: string | null;
  setUserId: (id: string | null) => void;

  // Timer
  activeTimer: ActiveTimer | null;
  startTimer: (category: "active" | "passive") => void;
  stopTimer: () => Promise<TimeEntry | null>;

  // Entries
  todayEntries: TimeEntry[];
  weekEntries: TimeEntry[];
  monthEntries: TimeEntry[];
  yearEntries: TimeEntry[];
  allEntries: TimeEntry[];
  loadTodayEntries: () => Promise<void>;
  loadWeekEntries: () => Promise<void>;
  loadMonthEntries: () => Promise<void>;
  loadYearEntries: () => Promise<void>;
  loadAllEntries: () => Promise<void>;

  // Anki
  ankiSnapshots: AnkiSnapshot[];
  monthAnkiSnapshots: AnkiSnapshot[];
  yearAnkiSnapshots: AnkiSnapshot[];
  allAnkiSnapshots: AnkiSnapshot[];
  loadAnkiSnapshots: () => Promise<void>;
  loadMonthAnkiSnapshots: () => Promise<void>;
  loadYearAnkiSnapshots: () => Promise<void>;
  loadAllAnkiSnapshots: () => Promise<void>;

  // Settings
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;

  // Data version (bumped after imports/sync to trigger chart refresh)
  dataVersion: number;
  bumpDataVersion: () => void;

  // Selected date for EntryList / AnkiStatus sync
  selectedDate: string;
  setSelectedDate: (date: string) => void;

  // Init
  initTimer: () => Promise<void>;
}

function todayRange(): [number, number] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86400000);
  return [start.getTime(), end.getTime()];
}

function weekRange(weekStartsOn: 0 | 1): [number, number] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  const weekStart = new Date(today.getTime() - diff * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  return [weekStart.getTime(), weekEnd.getTime()];
}

function monthRange(): [number, number] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [start.getTime(), end.getTime()];
}

function yearRange(): [number, number] {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return [start.getTime(), end.getTime()];
}

function allRange(): [number, number] {
  return [0, Date.now() + 86400000];
}

export const useAppStore = create<AppState>((set, get) => ({
  userId: null,
  setUserId: (id) => set({ userId: id }),

  activeTimer: null,

  startTimer: (category) => {
    const timer: ActiveTimer = {
      category,
      startTime: Date.now(),
      isRunning: true,
    };
    set({ activeTimer: timer });
    const { userId } = get();
    if (userId) saveActiveTimer(userId, timer);
  },

  stopTimer: async () => {
    const { activeTimer, userId } = get();
    if (!activeTimer || !userId) return null;

    const endTime = Date.now();
    const duration = Math.round((endTime - activeTimer.startTime) / 1000);

    if (duration < 1) {
      set({ activeTimer: null });
      await clearActiveTimer(userId);
      return null;
    }

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      category: activeTimer.category,
      startTime: activeTimer.startTime,
      endTime,
      duration,
      source: "manual",
      createdAt: Date.now(),
    };

    await addTimeEntry(userId, entry);
    set({ activeTimer: null });
    await clearActiveTimer(userId);
    await get().loadTodayEntries();
    await get().loadWeekEntries();
    get().bumpDataVersion();
    return entry;
  },

  todayEntries: [],
  weekEntries: [],
  monthEntries: [],
  yearEntries: [],
  allEntries: [],

  loadTodayEntries: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = todayRange();
    const entries = await getTimeEntriesForRange(userId, start, end);
    set({ todayEntries: entries });
  },

  loadWeekEntries: async () => {
    const { userId, settings } = get();
    if (!userId) return;
    const [start, end] = weekRange(settings.weekStartsOn);
    const entries = await getTimeEntriesForRange(userId, start, end);
    set({ weekEntries: entries });
  },

  loadMonthEntries: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = monthRange();
    const entries = await getTimeEntriesForRange(userId, start, end);
    set({ monthEntries: entries });
  },

  loadYearEntries: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = yearRange();
    const entries = await getTimeEntriesForRange(userId, start, end);
    set({ yearEntries: entries });
  },

  loadAllEntries: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = allRange();
    const entries = await getTimeEntriesForRange(userId, start, end);
    set({ allEntries: entries });
  },

  ankiSnapshots: [],
  monthAnkiSnapshots: [],
  yearAnkiSnapshots: [],
  allAnkiSnapshots: [],

  loadAnkiSnapshots: async () => {
    const { userId, settings } = get();
    if (!userId) return;
    const [start, end] = weekRange(settings.weekStartsOn);
    const startDate = toLocalDateStr(new Date(start));
    const endDate = toLocalDateStr(new Date(end));
    const snapshots = await getAnkiSnapshotsForRange(
      userId,
      startDate,
      endDate,
    );
    set({ ankiSnapshots: snapshots });
  },

  loadMonthAnkiSnapshots: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = monthRange();
    const startDate = toLocalDateStr(new Date(start));
    const endDate = toLocalDateStr(new Date(end));
    const snapshots = await getAnkiSnapshotsForRange(
      userId,
      startDate,
      endDate,
    );
    set({ monthAnkiSnapshots: snapshots });
  },

  loadYearAnkiSnapshots: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = yearRange();
    const startDate = toLocalDateStr(new Date(start));
    const endDate = toLocalDateStr(new Date(end));
    const snapshots = await getAnkiSnapshotsForRange(
      userId,
      startDate,
      endDate,
    );
    set({ yearAnkiSnapshots: snapshots });
  },

  loadAllAnkiSnapshots: async () => {
    const { userId } = get();
    if (!userId) return;
    const [start, end] = allRange();
    const startDate = toLocalDateStr(new Date(start));
    const endDate = toLocalDateStr(new Date(end));
    const snapshots = await getAnkiSnapshotsForRange(
      userId,
      startDate,
      endDate,
    );
    set({ allAnkiSnapshots: snapshots });
  },

  settings: DEFAULT_SETTINGS,
  setSettings: (newSettings) => {
    set({ settings: newSettings });
    const { userId } = get();
    if (userId) saveSettingsToDb(userId, newSettings);
  },

  dataVersion: 0,
  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  selectedDate: toLocalDateStr(),
  setSelectedDate: (date: string) => set({ selectedDate: date }),

  initTimer: async () => {
    const { userId } = get();
    if (!userId) return;
    const timer = await loadActiveTimer(userId);
    if (timer?.isRunning) {
      set({ activeTimer: timer });
    }
    const savedSettings = await loadSettingsFromDb(userId);
    if (savedSettings) {
      set({ settings: { ...DEFAULT_SETTINGS, ...savedSettings } });
    }
  },
}));
