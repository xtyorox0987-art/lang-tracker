import { create } from "zustand";
import type {
  ActiveTimer,
  TimeEntry,
  AnkiSnapshot,
  AppSettings,
  VideoResource,
  VideoWatchSession,
  DeckProgressSnapshot,
} from "../types";
import { DEFAULT_SETTINGS, toLocalDateStr } from "../types";
import {
  todayRange,
  weekRange,
  monthRange,
  yearRange,
  allRange,
} from "../lib/dates";
import {
  addTimeEntry,
  getTimeEntriesForRange,
  getAnkiSnapshotsForRange,
  getVideoResources,
  upsertVideoResource,
  addVideoWatchSession,
  getVideoWatchSessionsForRange,
  getLatestDeckProgressSnapshots,
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

  // Recommendations
  videoResources: VideoResource[];
  videoWatchSessions: VideoWatchSession[];
  deckProgressSnapshots: DeckProgressSnapshot[];
  loadRecommendationData: () => Promise<void>;
  saveVideoResource: (resource: VideoResource) => Promise<void>;
  markVideoWatched: (resource: VideoResource) => Promise<void>;
  dismissVideoResource: (resource: VideoResource) => Promise<void>;

  // Init
  initTimer: () => Promise<void>;
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

  videoResources: [],
  videoWatchSessions: [],
  deckProgressSnapshots: [],

  loadRecommendationData: async () => {
    const { userId } = get();
    if (!userId) return;
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 86400000;
    const [resources, sessions, deckSnaps] = await Promise.all([
      getVideoResources(userId),
      getVideoWatchSessionsForRange(userId, ninetyDaysAgo, now + 86400000),
      getLatestDeckProgressSnapshots(userId),
    ]);
    set({
      videoResources: resources,
      videoWatchSessions: sessions,
      deckProgressSnapshots: deckSnaps,
    });
  },

  saveVideoResource: async (resource) => {
    const { userId } = get();
    if (!userId) return;
    await upsertVideoResource(userId, resource);
    await get().loadRecommendationData();
  },

  markVideoWatched: async (resource) => {
    const { userId } = get();
    if (!userId) return;
    const now = Date.now();
    const duration = resource.durationSec ?? 0;
    const watched: VideoResource = {
      ...resource,
      status: "watched",
      watchedAt: now,
      updatedAt: now,
    };
    await upsertVideoResource(userId, watched);
    if (duration > 0) {
      await addVideoWatchSession(userId, {
        id: crypto.randomUUID(),
        resourceId: resource.id,
        videoId: resource.videoId,
        title: resource.title,
        channel: resource.channel,
        url: resource.url,
        startTime: now - duration * 1000,
        endTime: now,
        duration,
        listeningMode: "active",
        completionPct: 100,
        source: "manual",
        createdAt: now,
      });
    }
    await get().loadRecommendationData();
  },

  dismissVideoResource: async (resource) => {
    const { userId } = get();
    if (!userId) return;
    const now = Date.now();
    await upsertVideoResource(userId, {
      ...resource,
      status: "dismissed",
      dismissedAt: now,
      updatedAt: now,
    });
    await get().loadRecommendationData();
  },

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
