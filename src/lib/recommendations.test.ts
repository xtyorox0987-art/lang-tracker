import { describe, expect, it } from "vitest";
import type {
  AppSettings,
  DeckProgressSnapshot,
  TimeEntry,
  VideoResource,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import {
  extractYouTubeVideoId,
  getRoutineDay,
  recommendVideos,
} from "./recommendations";

const NOW = new Date("2026-05-17T12:00:00");

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    recommendationRoutineStartDate: "2026-05-15",
    ...overrides,
  };
}

function video(overrides: Partial<VideoResource> = {}): VideoResource {
  const now = NOW.getTime();
  return {
    id: crypto.randomUUID(),
    url: "https://www.youtube.com/watch?v=abc123xyz00",
    videoId: "abc123xyz00",
    title: "A useful immersion video",
    channel: "Chosen Channel",
    deckNumber: 1,
    durationSec: 12 * 60,
    source: "manual",
    manualDifficulty: 3,
    comprehensibilityPct: 86,
    status: "candidate",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  const startTime = NOW.getTime() - 30 * 60 * 1000;
  return {
    id: crypto.randomUUID(),
    category: "active",
    startTime,
    endTime: startTime + 20 * 60 * 1000,
    duration: 20 * 60,
    source: "manual",
    createdAt: startTime,
    ...overrides,
  };
}

function deck(
  overrides: Partial<DeckProgressSnapshot> = {},
): DeckProgressSnapshot {
  return {
    id: crypto.randomUUID(),
    deckName: "Foundation",
    role: "foundation",
    newCount: 100,
    learnCount: 0,
    reviewCount: 0,
    dueCount: 0,
    totalCount: 100,
    syncedAt: NOW.getTime(),
    ...overrides,
  };
}

describe("recommendations", () => {
  it("extracts YouTube IDs from common URLs", () => {
    expect(extractYouTubeVideoId("https://youtu.be/abc123xyz00")).toBe(
      "abc123xyz00",
    );
    expect(
      extractYouTubeVideoId("https://www.youtube.com/shorts/short123"),
    ).toBe("short123");
  });

  it("anchors the 3-day routine", () => {
    expect(getRoutineDay("2026-05-15", NOW)).toBe(3);
    expect(getRoutineDay("2026-05-16", NOW)).toBe(2);
  });

  it("keeps new Anki at 10 cards when active listening is under 3 hours", () => {
    const result = recommendVideos({
      resources: [video()],
      watchSessions: [],
      deckProgressSnapshots: [deck()],
      todayEntries: [entry({ duration: 45 * 60 })],
      ankiSnapshots: [],
      settings: settings({ recommendationSelectedChannel: "Chosen" }),
      now: NOW,
    });

    expect(result.context.newCardsTarget).toBe(10);
    expect(result.recommendations[0].resource.title).toBe(
      "A useful immersion video",
    );
    expect(result.recommendations[0].reasons.map((r) => r.kind)).toContain(
      "routine",
    );
  });

  it("allows 20 new cards after 3 hours of active listening", () => {
    const result = recommendVideos({
      resources: [video()],
      watchSessions: [],
      deckProgressSnapshots: [deck()],
      todayEntries: [entry({ duration: 3 * 60 * 60 })],
      ankiSnapshots: [],
      settings: settings(),
      now: NOW,
    });

    expect(result.context.newCardsTarget).toBe(20);
    expect(result.recommendations[0].nextAction).toContain("20 new Anki");
  });

  it("switches to the foundation remaining deck on day 3 after foundation runs out", () => {
    const result = recommendVideos({
      resources: [video()],
      watchSessions: [],
      deckProgressSnapshots: [
        deck({ newCount: 0 }),
        deck({
          deckName: "Foundation Remaining",
          role: "foundationRemaining",
          newCount: 80,
        }),
      ],
      todayEntries: [],
      ankiSnapshots: [],
      settings: settings(),
      now: NOW,
    });

    expect(result.context.focus).toBe("foundationRemaining");
    expect(result.context.needsYoutubeBeforeAnki).toBe(false);
  });

  it("returns a useful empty state when no candidates exist", () => {
    const result = recommendVideos({
      resources: [],
      watchSessions: [],
      deckProgressSnapshots: [],
      todayEntries: [],
      ankiSnapshots: [],
      settings: settings(),
      now: NOW,
    });

    expect(result.recommendations).toHaveLength(0);
    expect(result.emptyReason).toMatch(/candidate video/i);
  });
});
