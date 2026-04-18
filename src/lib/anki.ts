import type { AnkiSnapshot } from "../types";
import { toLocalDateStr } from "../types";

// In dev, use Vite proxy to avoid CORS. In production, direct to AnkiConnect.
// Production users need to configure AnkiConnect's webCorsOriginList.
function getAnkiUrl(): string {
  if (import.meta.env.DEV) {
    return "/anki-api";
  }
  return "http://localhost:8765";
}

async function ankiInvoke(
  action: string,
  params: Record<string, unknown> = {},
) {
  const res = await fetch(getAnkiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

export async function isAnkiConnected(): Promise<boolean> {
  try {
    await ankiInvoke("version");
    return true;
  } catch {
    return false;
  }
}

export async function fetchTodayAnkiStats(): Promise<AnkiSnapshot | null> {
  try {
    const connected = await isAnkiConnected();
    if (!connected) return null;

    const today = toLocalDateStr();

    // Get number of cards reviewed today
    const reviewedToday: number = await ankiInvoke("getNumCardsReviewedToday");

    // Get collection stats to extract review time
    // Use cardReviews for a recent time range
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    let reviewTimeMs = 0;
    try {
      // getReviewsOfCards needs card IDs, so instead use getNumCardsReviewedByDay
      await ankiInvoke("getNumCardsReviewedByDay");
      // reviewsByDay is [[daysSinceEpoch, count], ...] — not useful for time

      // Try to get review time from collection stats
      // Actually use findCards to get reviewed today, then get reviews
      const cardIds: number[] = await ankiInvoke("findCards", {
        query: "rated:1",
      });
      if (cardIds.length > 0) {
        // Get reviews for those cards — limit to avoid huge response
        const limitedIds = cardIds.slice(0, 500);
        const reviews: Record<
          string,
          Array<{ id: number; time: number }>
        > = await ankiInvoke("getReviewsOfCards", { cards: limitedIds });

        for (const cardReviews of Object.values(reviews)) {
          for (const review of cardReviews) {
            // review.id is epoch milliseconds of the review
            if (
              review.id >= dayStart.getTime() &&
              review.id <= dayEnd.getTime()
            ) {
              reviewTimeMs += review.time; // time in ms
            }
          }
        }
      }
    } catch {
      // fallback: estimate from count
      reviewTimeMs = reviewedToday * 8000; // rough 8sec per card
    }

    // Get card counts
    let matureCount = 0;
    let youngCount = 0;
    let newCount = 0;

    try {
      const matureIds: number[] = await ankiInvoke("findCards", {
        query: "prop:ivl>=21",
      });
      matureCount = matureIds.length;

      const youngIds: number[] = await ankiInvoke("findCards", {
        query: "prop:ivl<21 -is:new",
      });
      youngCount = youngIds.length;

      const newIds: number[] = await ankiInvoke("findCards", {
        query: "is:new",
      });
      newCount = newIds.length;
    } catch {
      // ignore
    }

    return {
      id: `anki-${today}`,
      date: today,
      syncedAt: Date.now(),
      reviewCount: reviewedToday,
      reviewTimeMs,
      matureCount,
      youngCount,
      newCount,
    };
  } catch {
    return null;
  }
}

/**
 * Backfill daily matureCount history from Anki review logs.
 * Returns AnkiSnapshot[] for each day from the earliest review to yesterday.
 * Only matureCount is meaningful; reviewCount/reviewTimeMs are per-day approximations.
 */
export async function backfillAnkiMatureHistory(
  onProgress?: (pct: number, msg: string) => void,
): Promise<AnkiSnapshot[]> {
  onProgress?.(0, "Finding all cards…");

  // 1. Get all card IDs
  const allCardIds: number[] = await ankiInvoke("findCards", { query: "" });
  if (allCardIds.length === 0) return [];

  // 2. Fetch reviews in batches
  const BATCH = 500;
  interface Review {
    id: number; // epoch ms
    ivl: number; // interval after review (days; negative = seconds for learning)
    time: number; // review time in ms
  }

  // Map: cardId -> latest ivl as of each date processing
  const cardLastIvl = new Map<number, number>();
  // Collect all reviews with card info
  const allReviews: Array<{
    cardId: number;
    date: string;
    ivl: number;
    timeMs: number;
  }> = [];

  for (let i = 0; i < allCardIds.length; i += BATCH) {
    const batch = allCardIds.slice(i, i + BATCH);
    const pct = Math.round((i / allCardIds.length) * 60);
    onProgress?.(pct, `Fetching reviews… ${i}/${allCardIds.length} cards`);

    const reviewsMap: Record<string, Review[]> = await ankiInvoke(
      "getReviewsOfCards",
      { cards: batch },
    );

    for (const [cardIdStr, reviews] of Object.entries(reviewsMap)) {
      const cardId = Number(cardIdStr);
      for (const r of reviews) {
        const date = toLocalDateStr(new Date(r.id));
        allReviews.push({ cardId, date, ivl: r.ivl, timeMs: r.time });
      }
    }
  }

  if (allReviews.length === 0) return [];

  onProgress?.(65, "Processing review history…");

  // 3. Sort reviews chronologically
  allReviews.sort(
    (a, b) => a.date.localeCompare(b.date) || a.cardId - b.cardId,
  );

  // 4. Find date range
  const firstDate = allReviews[0].date;
  const today = toLocalDateStr();

  // 5. Process day by day
  // Group reviews by date
  const reviewsByDate = new Map<string, typeof allReviews>();
  for (const r of allReviews) {
    let arr = reviewsByDate.get(r.date);
    if (!arr) {
      arr = [];
      reviewsByDate.set(r.date, arr);
    }
    arr.push(r);
  }

  const snapshots: AnkiSnapshot[] = [];
  let currentDate = firstDate;

  while (currentDate <= today) {
    const dayReviews = reviewsByDate.get(currentDate);
    let dayReviewCount = 0;
    let dayReviewTimeMs = 0;

    if (dayReviews) {
      // For each review on this day, update the card's last known interval
      // Use last review per card on this day
      const cardDayReviews = new Map<
        number,
        { ivl: number; timeMs: number; count: number }
      >();
      for (const r of dayReviews) {
        const existing = cardDayReviews.get(r.cardId);
        if (existing) {
          existing.ivl = r.ivl; // last review's interval wins
          existing.timeMs += r.timeMs;
          existing.count++;
        } else {
          cardDayReviews.set(r.cardId, {
            ivl: r.ivl,
            timeMs: r.timeMs,
            count: 1,
          });
        }
      }

      for (const [cardId, data] of cardDayReviews) {
        cardLastIvl.set(cardId, data.ivl);
        dayReviewCount += data.count;
        dayReviewTimeMs += data.timeMs;
      }
    }

    // Count mature cards (ivl >= 21 days)
    let matureCount = 0;
    for (const ivl of cardLastIvl.values()) {
      if (ivl >= 21) matureCount++;
    }

    snapshots.push({
      id: `anki-${currentDate}`,
      date: currentDate,
      syncedAt: Date.now(),
      reviewCount: dayReviewCount,
      reviewTimeMs: dayReviewTimeMs,
      matureCount,
      youngCount: 0,
      newCount: 0,
    });

    // Advance to next day
    const d = new Date(currentDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    currentDate = toLocalDateStr(d);
  }

  onProgress?.(100, `Done! ${snapshots.length} days backfilled`);
  return snapshots;
}
