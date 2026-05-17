import type {
  AnkiSnapshot,
  AppSettings,
  DeckProgressSnapshot,
  DeckRole,
  RecommendationContext,
  RecommendationReason,
  RecommendationReasonKind,
  RecommendationResult,
  TimeEntry,
  VideoResource,
  VideoWatchSession,
} from "../types";
import { toLocalDateStr } from "../types";

const THREE_HOURS_SEC = 3 * 60 * 60;
const DEFAULT_ACTIVE_GOAL_SEC = THREE_HOURS_SEC;

export interface RecommendVideosInput {
  resources: VideoResource[];
  watchSessions: VideoWatchSession[];
  deckProgressSnapshots: DeckProgressSnapshot[];
  todayEntries: TimeEntry[];
  ankiSnapshots: AnkiSnapshot[];
  settings: AppSettings;
  now?: Date;
}

export interface RecommendVideosOutput {
  context: RecommendationContext;
  recommendations: RecommendationResult[];
  emptyReason?: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const fromWatch = parsed.searchParams.get("v");
      if (fromWatch) return fromWatch;
      const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/)?.[1];
      if (shorts) return shorts;
      const embed = parsed.pathname.match(/\/embed\/([^/?]+)/)?.[1];
      if (embed) return embed;
    }
  } catch {
    return null;
  }
  return null;
}

export function getRoutineDay(
  routineStartDate: string,
  now: Date = new Date(),
): 1 | 2 | 3 {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = routineStartDate
    ? new Date(`${routineStartDate}T00:00:00`)
    : today;
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const normalized = ((diffDays % 3) + 3) % 3;
  return (normalized + 1) as 1 | 2 | 3;
}

export function recommendVideos(
  input: RecommendVideosInput,
): RecommendVideosOutput {
  const now = input.now ?? new Date();
  const context = buildRecommendationContext(input, now);
  const candidates = input.resources.filter(
    (resource) => resource.status !== "dismissed",
  );

  if (candidates.length === 0) {
    return {
      context,
      recommendations: [],
      emptyReason: "Add a candidate video to start getting recommendations.",
    };
  }

  const recommendations = candidates
    .map((resource) =>
      scoreResource(
        resource,
        input.watchSessions,
        input.ankiSnapshots,
        context,
        input.settings,
        now,
      ),
    )
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, input.settings.recommendationMaxSuggestions || 3));

  return {
    context,
    recommendations,
    emptyReason:
      recommendations.length === 0
        ? "No candidate videos are eligible right now. Add another video or restore a skipped one."
        : undefined,
  };
}

function buildRecommendationContext(
  input: RecommendVideosInput,
  now: Date,
): RecommendationContext {
  const activeSecondsToday = input.todayEntries
    .filter((entry) => entry.category === "active")
    .reduce((sum, entry) => sum + entry.duration, 0);
  const newCardsTarget: 10 | 20 =
    activeSecondsToday >= THREE_HOURS_SEC ? 20 : 10;
  const routineDay = getRoutineDay(
    input.settings.recommendationRoutineStartDate,
    now,
  );
  const focus = resolveDeckFocus(routineDay, input.deckProgressSnapshots);
  return {
    routineDay,
    newCardsTarget,
    activeSecondsToday,
    activeGoalSeconds:
      input.settings.dailyGoalMinutes > 0
        ? input.settings.dailyGoalMinutes * 60
        : DEFAULT_ACTIVE_GOAL_SEC,
    focus,
    needsYoutubeBeforeAnki: focus === "youtubeChannel",
    hasDeckProgress: input.deckProgressSnapshots.length > 0,
  };
}

function resolveDeckFocus(
  routineDay: 1 | 2 | 3,
  snapshots: DeckProgressSnapshot[],
): DeckRole {
  const foundationNew = sumNewCards(snapshots, "foundation");
  const remainingNew = sumNewCards(snapshots, "foundationRemaining");

  if (snapshots.length === 0) {
    return routineDay === 3 ? "youtubeChannel" : "foundation";
  }

  if (foundationNew > 0) {
    return routineDay === 3 ? "youtubeChannel" : "foundation";
  }

  if (remainingNew > 0) {
    return routineDay === 3 ? "foundationRemaining" : "youtubeChannel";
  }

  return "youtubeChannel";
}

function sumNewCards(
  snapshots: DeckProgressSnapshot[],
  role: DeckRole,
): number {
  return snapshots
    .filter((snap) => snap.role === role)
    .reduce((sum, snap) => sum + snap.newCount, 0);
}

function scoreResource(
  resource: VideoResource,
  sessions: VideoWatchSession[],
  ankiSnapshots: AnkiSnapshot[],
  context: RecommendationContext,
  settings: AppSettings,
  now: Date,
): RecommendationResult {
  const reasons: RecommendationReason[] = [];
  const risks: string[] = [];
  let score = resource.status === "watched" ? 10 : 50;
  const watchedSec = watchedSeconds(resource, sessions);

  const add = (
    kind: RecommendationReasonKind,
    label: string,
    detail: string,
    weight: number,
  ) => {
    score += weight;
    reasons.push({ kind, label, detail, weight });
  };

  if (context.needsYoutubeBeforeAnki) {
    add(
      "routine",
      "YouTube deck day",
      "Today is the YouTube-channel slot in the 3-day Anki loop.",
      22,
    );
  } else if (context.focus === "foundation") {
    add(
      "routine",
      "Foundation day support",
      "Use this as active input while keeping new Anki on the foundation deck.",
      6,
    );
  } else if (context.focus === "foundationRemaining") {
    add(
      "routine",
      "Remaining deck day",
      "The foundation remaining deck is the current new-card focus.",
      4,
    );
  }

  const selectedChannel = settings.recommendationSelectedChannel
    .trim()
    .toLowerCase();
  if (
    selectedChannel &&
    resource.channel.toLowerCase().includes(selectedChannel)
  ) {
    add(
      "channel",
      "Chosen channel",
      "This matches your selected listening channel.",
      16,
    );
  }

  if (resource.linkedDeckName || resource.deckNumber) {
    const label = resource.linkedDeckName
      ? `Deck: ${resource.linkedDeckName}`
      : `Channel deck ${resource.deckNumber}`;
    add(
      "deck",
      label,
      "The video is tied to a deck you can study after watching.",
      context.needsYoutubeBeforeAnki ? 14 : 8,
    );
  }

  if (!context.hasDeckProgress) {
    risks.push(
      "Deck progress has not been synced yet, so deck readiness is estimated.",
    );
  }

  const hasTodayAnkiSnapshot = ankiSnapshots.some(
    (snap) => snap.date === toLocalDateStr(now),
  );
  if (!hasTodayAnkiSnapshot) {
    risks.push(
      "Today's Anki snapshot is missing; sync Anki for a sharper plan.",
    );
  }

  if (resource.durationSec) {
    if (resource.durationSec <= 15 * 60) {
      add(
        "time",
        "Quick session",
        "Short enough to start even when activation energy is low.",
        context.activeSecondsToday < 30 * 60 ? 14 : 8,
      );
    } else if (resource.durationSec <= 35 * 60) {
      add(
        "time",
        "Good active block",
        "Fits a focused active-listening block without becoming too heavy.",
        10,
      );
    } else if (resource.durationSec > 60 * 60) {
      risks.push(
        "Long video: consider watching one segment instead of the full video.",
      );
      score -= 8;
    }
  }

  if (typeof resource.comprehensibilityPct === "number") {
    if (
      resource.comprehensibilityPct >= 80 &&
      resource.comprehensibilityPct <= 92
    ) {
      add(
        "comprehension",
        `${resource.comprehensibilityPct}% comprehensible`,
        "This sits in the useful stretch zone for active listening.",
        18,
      );
    } else if (resource.comprehensibilityPct >= 65) {
      add(
        "comprehension",
        `${resource.comprehensibilityPct}% coverage`,
        "Challenging, but still usable if you are fresh.",
        8,
      );
    } else {
      risks.push(
        "Low comprehensibility: save this for a challenge day or preview first.",
      );
      score -= 10;
    }
  }

  if (resource.manualDifficulty) {
    if (resource.manualDifficulty <= 3) {
      add(
        "mentalLoad",
        "Manageable difficulty",
        "Good fit for consistency without draining the day.",
        7,
      );
    } else if (context.activeSecondsToday >= THREE_HOURS_SEC) {
      add(
        "mentalLoad",
        "Stretch option",
        "You already have enough active time to make a harder video reasonable.",
        5,
      );
    } else {
      risks.push(
        "Higher difficulty: keep the new Anki target at 10 cards today.",
      );
      score -= 4;
    }
  }

  if (watchedSec === 0 && resource.status !== "watched") {
    add(
      "novelty",
      "Unwatched",
      "Fresh input expands the channel sample without extra searching.",
      12,
    );
  } else if (resource.durationSec && watchedSec < resource.durationSec * 0.75) {
    add(
      "novelty",
      "Continue",
      "You started this video but have not covered most of it yet.",
      9,
    );
  } else if (resource.status === "watched") {
    risks.push(
      "Already marked watched; only rewatch if it supports chorus or review.",
    );
    score -= 20;
  }

  if (context.activeSecondsToday >= THREE_HOURS_SEC) {
    add(
      "time",
      "20-card day possible",
      "Active listening is already above 3 hours, so a 20-card Anki day is optional.",
      4,
    );
  }

  score = Math.max(0, Math.round(score));
  return {
    resource,
    score,
    reasons: reasons.sort((a, b) => b.weight - a.weight).slice(0, 4),
    risks: risks.slice(0, 3),
    nextAction: nextAction(context, resource),
    confidence: confidenceFor(resource, watchedSec, score, reasons),
  };
}

function watchedSeconds(
  resource: VideoResource,
  sessions: VideoWatchSession[],
): number {
  return sessions
    .filter((session) => {
      if (session.resourceId && session.resourceId === resource.id) return true;
      if (
        session.videoId &&
        resource.videoId &&
        session.videoId === resource.videoId
      ) {
        return true;
      }
      return Boolean(session.url && session.url === resource.url);
    })
    .reduce((sum, session) => sum + session.duration, 0);
}

function nextAction(
  context: RecommendationContext,
  resource: VideoResource,
): string {
  if (context.needsYoutubeBeforeAnki) {
    if (context.newCardsTarget === 20) {
      return "Watch this before new YouTube-channel Anki cards; 20 new Anki cards are optional today.";
    }
    return "Watch this before new YouTube-channel Anki cards.";
  }
  if (resource.manualDifficulty && resource.manualDifficulty >= 4) {
    return "Preview one segment first, then keep new Anki at 10 cards if it feels heavy.";
  }
  if (context.newCardsTarget === 20) {
    return "Use it as today's active block; 20 new Anki cards are optional.";
  }
  return "Watch it as a focused active block, then do 10 new Anki cards.";
}

function confidenceFor(
  resource: VideoResource,
  watchedSec: number,
  score: number,
  reasons: RecommendationReason[],
): "low" | "medium" | "high" {
  const dataPoints = [
    resource.durationSec,
    resource.comprehensibilityPct,
    resource.manualDifficulty,
    resource.linkedDeckName ?? resource.deckNumber,
    watchedSec > 0,
  ].filter(Boolean).length;

  if (score >= 90 && reasons.length >= 3 && dataPoints >= 3) return "high";
  if (score >= 65 && reasons.length >= 2 && dataPoints >= 2) return "medium";
  return "low";
}
