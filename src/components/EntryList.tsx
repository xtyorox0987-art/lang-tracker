import { useAppStore } from "../store/useAppStore";
import { CATEGORY_LABELS, CATEGORY_COLORS, toLocalDateStr } from "../types";
import type { TimeEntry } from "../types";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDurationCompact(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function EntryRow({ entry }: { entry: TimeEntry }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-[#2a2a4a] last:border-0">
      <div
        className="w-2 h-8 rounded-full"
        style={{ backgroundColor: CATEGORY_COLORS[entry.category] }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-200">
          {CATEGORY_LABELS[entry.category]}
          {entry.note && (
            <span className="ml-2 text-gray-500 text-xs">{entry.note}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
        </div>
      </div>
      <div className="text-sm font-mono text-gray-400">
        {formatDurationCompact(entry.duration)}
      </div>
    </div>
  );
}

export function EntryList() {
  const { todayEntries, ankiSnapshots } = useAppStore();

  // Get today's Anki time from snapshots
  const today = toLocalDateStr();
  const todayAnkiSnap = ankiSnapshots.find((s) => s.date === today);
  const ankiSec = todayAnkiSnap
    ? Math.round(todayAnkiSnap.reviewTimeMs / 1000)
    : 0;

  const totalByCategory = todayEntries.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.duration;
      return acc;
    },
    {} as Record<string, number>,
  );
  // Include Anki time from snapshot
  totalByCategory["anki"] = (totalByCategory["anki"] ?? 0) + ankiSec;

  const totalSec = todayEntries.reduce((s, e) => s + e.duration, 0) + ankiSec;

  return (
    <div className="p-4">
      {/* Today summary */}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-200">Today</h2>
        <div className="text-2xl font-bold text-white">
          {formatDurationCompact(totalSec)}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="flex gap-4 mb-4 text-sm">
        {(["active", "passive", "anki"] as const).map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            <span className="text-gray-400">{CATEGORY_LABELS[cat]}</span>
            <span className="font-medium text-gray-300">
              {formatDurationCompact(totalByCategory[cat] ?? 0)}
            </span>
          </div>
        ))}
      </div>

      {/* Entry list */}
      {todayEntries.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-sm">
          No entries yet. Start your timer!
        </div>
      ) : (
        <div className="bg-[#1a1a2e] rounded-lg border border-[#2a2a4a]">
          {todayEntries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
