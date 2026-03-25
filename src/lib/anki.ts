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
