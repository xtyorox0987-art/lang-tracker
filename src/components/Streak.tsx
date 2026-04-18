import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { toLocalDateStr } from "../types";

const MIN_SECONDS = 300; // 5 minutes threshold

export function StreakBadge() {
  const { allEntries, allAnkiSnapshots } = useAppStore();

  const streak = useMemo(() => {
    // Build a set of dates that have ≥5min of activity
    const dailySec = new Map<string, number>();

    for (const e of allEntries) {
      const d = toLocalDateStr(new Date(e.startTime));
      dailySec.set(d, (dailySec.get(d) ?? 0) + e.duration);
    }
    for (const s of allAnkiSnapshots) {
      dailySec.set(
        s.date,
        (dailySec.get(s.date) ?? 0) + Math.round(s.reviewTimeMs / 1000),
      );
    }

    const activeDays = new Set<string>();
    for (const [date, sec] of dailySec) {
      if (sec >= MIN_SECONDS) activeDays.add(date);
    }

    // Count consecutive days ending today (or yesterday if today has no data yet)
    const today = toLocalDateStr();
    let count = 0;
    let d = new Date();

    // If today doesn't count yet, start from yesterday
    if (!activeDays.has(today)) {
      d.setDate(d.getDate() - 1);
      const yesterday = toLocalDateStr(d);
      if (!activeDays.has(yesterday)) return 0;
    }

    // Count back from the starting date
    while (activeDays.has(toLocalDateStr(d))) {
      count++;
      d = new Date(d.getTime() - 86400000);
    }

    return count;
  }, [allEntries, allAnkiSnapshots]);

  if (streak <= 0) return null;

  return (
    <span
      className="text-sm font-semibold"
      style={{ color: streak >= 7 ? "#f59e0b" : "#9ca3af" }}
      title={`${streak} day streak`}
    >
      🔥 {streak}
    </span>
  );
}
